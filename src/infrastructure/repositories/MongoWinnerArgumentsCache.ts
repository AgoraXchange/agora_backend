import { injectable, inject } from 'inversify';
import { Collection } from 'mongodb';
import { IWinnerArgumentsCache } from '../../domain/repositories/IWinnerArgumentsCache';
import { WinnerJuryArguments } from '../../domain/valueObjects/WinnerJuryArguments';
import { MongoDBConnection } from '../database/MongoDBConnection';
import { logger } from '../logging/Logger';

interface WinnerArgsDocument {
  _id: string; // contractId
  data: WinnerJuryArguments;
  createdAt: Date;
}

@injectable()
export class MongoWinnerArgumentsCache implements IWinnerArgumentsCache {
  private collection: Collection<WinnerArgsDocument>;
  private ttlSeconds: number | null;

  constructor(@inject('MongoDBConnection') private db: MongoDBConnection) {
    this.collection = this.db.getDb().collection<WinnerArgsDocument>('winnerArguments');
    const ttlMs = process.env.WINNER_ARGS_CACHE_TTL_MS ? parseInt(process.env.WINNER_ARGS_CACHE_TTL_MS, 10) : null;
    this.ttlSeconds = ttlMs ? Math.floor(ttlMs / 1000) : null;
    this.ensureIndexes().catch(err => logger.warn('WinnerArgs index setup failed', { error: String(err) }));
  }

  private async ensureIndexes(): Promise<void> {
    if (this.ttlSeconds && this.ttlSeconds > 0) {
      await this.collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: this.ttlSeconds });
    }
  }

  async getByContractId(contractId: string): Promise<WinnerJuryArguments | null> {
    const doc = await this.collection.findOne({ _id: contractId });
    return doc ? doc.data : null;
  }

  async save(contractId: string, data: WinnerJuryArguments): Promise<void> {
    await this.collection.updateOne(
      { _id: contractId },
      { $set: { data, createdAt: new Date() } },
      { upsert: true }
    );
  }
}

