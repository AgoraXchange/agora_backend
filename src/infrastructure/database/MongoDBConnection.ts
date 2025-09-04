import { MongoClient, Db, MongoClientOptions } from 'mongodb';
import { injectable } from 'inversify';
import { logger } from '../logging/Logger';

@injectable()
export class MongoDBConnection {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  async connect(): Promise<void> {
    try {
      // Resolve MongoDB connection string with sensible fallbacks
      let uri = (process.env.MONGODB_URI || process.env.MONGO_URL || '').trim();
      if (!uri) {
        uri = 'mongodb://localhost:27017';
        logger.warn('MONGODB_URI not set; falling back to localhost default.');
      }

      // Detect unexpanded template (e.g., "${{MongoDB.MONGO_URL}}") and fail early with guidance
      if (/\$\{\{[^}]+\}\}/.test(uri)) {
        throw new Error(
          `MongoDB URI appears to be a template (unexpanded): ${uri}. ` +
          'On Railway, set MONGODB_URI to ${{MongoDB.MONGO_URL}} in the dashboard; when running locally, set a concrete mongodb:// or mongodb+srv:// URL.'
        );
      }

      // Validate scheme
      const validScheme = /^(mongodb:\/\/|mongodb\+srv:\/\/)/.test(uri);
      if (!validScheme) {
        throw new Error('Invalid scheme, expected connection string to start with "mongodb://" or "mongodb+srv://"');
      }
      const dbName = process.env.MONGODB_DB_NAME || 'agora_oracle';

      // Connection tuning for k8s/container environments to reduce churn
      const maxPoolSize = parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10', 10);
      const minPoolSize = parseInt(process.env.MONGODB_MIN_POOL_SIZE || '0', 10);
      const maxIdleTimeMS = parseInt(process.env.MONGODB_MAX_IDLE_TIME_MS || '60000', 10); // 60s
      const connectTimeoutMS = parseInt(process.env.MONGODB_CONNECT_TIMEOUT_MS || '10000', 10); // 10s
      const socketTimeoutMS = parseInt(process.env.MONGODB_SOCKET_TIMEOUT_MS || '60000', 10); // 60s
      const serverSelectionTimeoutMS = parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '10000', 10); // 10s
      const heartbeatFrequencyMS = parseInt(process.env.MONGODB_HEARTBEAT_FREQUENCY_MS || '10000', 10); // 10s
      const retryReads = (process.env.MONGODB_RETRY_READS || 'true') === 'true';
      const retryWrites = (process.env.MONGODB_RETRY_WRITES || 'true') === 'true';
      const appName = process.env.MONGODB_APP_NAME || 'agora-oracle';

      const options: MongoClientOptions = {
        appName,
        maxPoolSize,
        minPoolSize,
        maxIdleTimeMS,
        connectTimeoutMS,
        socketTimeoutMS,
        serverSelectionTimeoutMS,
        heartbeatFrequencyMS,
        retryReads,
        retryWrites,
        w: 'majority'
      };

      this.client = new MongoClient(uri, options);

      await this.client.connect();
      this.db = this.client.db(dbName);
      
      logger.info('Connected to MongoDB', { dbName, appName, maxPoolSize, minPoolSize, maxIdleTimeMS });
    } catch (error) {
      logger.error('Failed to connect to MongoDB', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  getDb(): Db {
    if (!this.db) {
      throw new Error('Database not connected');
    }
    return this.db;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      logger.info('Disconnected from MongoDB');
    }
  }
}
