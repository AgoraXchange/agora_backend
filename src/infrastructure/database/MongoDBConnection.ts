import { MongoClient, Db } from 'mongodb';
import { injectable } from 'inversify';
import { logger } from '../logging/Logger';

@injectable()
export class MongoDBConnection {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  async connect(): Promise<void> {
    try {
      const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
      const dbName = process.env.MONGODB_DB_NAME || 'agora_oracle';

      this.client = new MongoClient(uri, {
        maxPoolSize: 10,
        minPoolSize: 5,
        retryWrites: true,
        w: 'majority'
      });

      await this.client.connect();
      this.db = this.client.db(dbName);
      
      logger.info('Connected to MongoDB', { dbName });
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
