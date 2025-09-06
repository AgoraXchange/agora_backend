import { MongoClient, Db, MongoClientOptions } from 'mongodb';
import { injectable } from 'inversify';
import { logger } from '../logging/Logger';

@injectable()
export class MongoDBConnection {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private isConnecting = false;

  async connect(): Promise<void> {
    if (this.isConnecting) {
      logger.debug('Connection already in progress, waiting...');
      return;
    }

    if (this.client && this.db) {
      try {
        // Test existing connection
        await this.client.db('admin').admin().ping();
        logger.debug('Existing MongoDB connection is healthy');
        return;
      } catch (error) {
        logger.warn('Existing connection unhealthy, reconnecting...', { 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        await this.forceDisconnect();
      }
    }

    this.isConnecting = true;
    
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

      // Connection tuning for Railway/container environments to reduce churn
      const maxPoolSize = parseInt(process.env.MONGODB_MAX_POOL_SIZE || '5', 10); // Reduced from 10
      const minPoolSize = parseInt(process.env.MONGODB_MIN_POOL_SIZE || '1', 10); // Increased from 0
      const maxIdleTimeMS = parseInt(process.env.MONGODB_MAX_IDLE_TIME_MS || '300000', 10); // 5min (was 1min)
      const connectTimeoutMS = parseInt(process.env.MONGODB_CONNECT_TIMEOUT_MS || '30000', 10); // 30s (was 10s)
      const socketTimeoutMS = parseInt(process.env.MONGODB_SOCKET_TIMEOUT_MS || '300000', 10); // 5min (was 1min)
      const serverSelectionTimeoutMS = parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '30000', 10); // 30s (was 10s)
      const heartbeatFrequencyMS = parseInt(process.env.MONGODB_HEARTBEAT_FREQUENCY_MS || '30000', 10); // 30s (was 10s)
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
        w: 'majority',
        // Additional stability options for Railway
        maxConnecting: 2 // Limit concurrent connections
      };

      this.client = new MongoClient(uri, options);

      await this.client.connect();
      this.db = this.client.db(dbName);
      
      // Setup connection event handlers for automatic reconnection
      this.client.on('error', (error) => {
        logger.error('MongoDB connection error', { error: error.message });
      });
      
      this.client.on('close', () => {
        logger.warn('MongoDB connection closed, will attempt to reconnect on next operation');
        this.client = null;
        this.db = null;
      });

      this.client.on('reconnect', () => {
        logger.info('MongoDB reconnected successfully');
      });
      
      logger.info('Connected to MongoDB', { dbName, appName, maxPoolSize, minPoolSize, maxIdleTimeMS });
    } catch (error) {
      logger.error('Failed to connect to MongoDB', { error: error instanceof Error ? error.message : 'Unknown error' });
      this.client = null;
      this.db = null;
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  getDb(): Db {
    if (!this.db) {
      throw new Error('Database not connected');
    }
    return this.db;
  }

  private async forceDisconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close(true); // Force close
      } catch (error) {
        logger.warn('Error during force disconnect', { error: error instanceof Error ? error.message : 'Unknown error' });
      } finally {
        this.client = null;
        this.db = null;
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        logger.info('Disconnected from MongoDB gracefully');
      } catch (error) {
        logger.warn('Error during graceful disconnect', { error: error instanceof Error ? error.message : 'Unknown error' });
      } finally {
        this.client = null;
        this.db = null;
      }
    }
  }

  async ensureConnection(): Promise<void> {
    if (!this.client || !this.db) {
      await this.connect();
    }
  }
}
