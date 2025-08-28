import { injectable, inject } from 'inversify';
import { Collection } from 'mongodb';
import { IContractRepository } from '../../domain/repositories/IContractRepository';
import { Contract, ContractStatus } from '../../domain/entities/Contract';
import { Party } from '../../domain/entities/Party';
import { BettingStats } from '../../domain/entities/BettingStats';
import { MongoDBConnection } from '../database/MongoDBConnection';
import { logger } from '../logging/Logger';

interface ContractDocument {
  _id: string;
  contractAddress: string;
  partyA: {
    id: string;
    address: string;
    name: string;
    description: string;
  };
  partyB: {
    id: string;
    address: string;
    name: string;
    description: string;
  };
  bettingEndTime: Date;
  winnerRewardPercentage: number;
  status: ContractStatus;
  winnerId?: string;
  creator?: string;
  topic?: string;
  description?: string;
  bettingStats?: BettingStats;
  createdAt: Date;
  updatedAt: Date;
}

@injectable()
export class MongoContractRepository implements IContractRepository {
  private collection: Collection<ContractDocument>;

  constructor(
    @inject('MongoDBConnection') private dbConnection: MongoDBConnection
  ) {
    this.collection = this.dbConnection.getDb().collection<ContractDocument>('contracts');
    this.createIndexes();
  }

  private async createIndexes(): Promise<void> {
    try {
      await this.collection.createIndex({ contractAddress: 1 }, { unique: true });
      await this.collection.createIndex({ status: 1, bettingEndTime: 1 });
      await this.collection.createIndex({ winnerId: 1 });
      logger.info('MongoDB indexes created for contracts collection');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create indexes', { error: errorMessage });
    }
  }

  async findById(id: string): Promise<Contract | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? this.documentToEntity(doc) : null;
  }

  async findByAddress(address: string): Promise<Contract | null> {
    const doc = await this.collection.findOne({ contractAddress: address });
    return doc ? this.documentToEntity(doc) : null;
  }

  async findContractsReadyForDecision(): Promise<Contract[]> {
    const now = new Date();
    const docs = await this.collection.find({
      status: ContractStatus.BETTING_CLOSED,
      bettingEndTime: { $lte: now },
      winnerId: { $exists: false }
    }).toArray();
    
    return docs.map(doc => this.documentToEntity(doc));
  }

  async findAll(): Promise<Contract[]> {
    const docs = await this.collection.find({}).toArray();
    return docs.map(doc => this.documentToEntity(doc));
  }

  async save(contract: Contract): Promise<void> {
    const doc = this.entityToDocument(contract);
    await this.collection.insertOne(doc);
    logger.info('Contract saved', { contractId: contract.id });
  }

  async update(contract: Contract): Promise<void> {
    const doc = this.entityToDocument(contract);
    doc.updatedAt = new Date();
    
    await this.collection.replaceOne(
      { _id: contract.id },
      doc,
      { upsert: false }
    );
    
    logger.info('Contract updated', { contractId: contract.id });
  }

  private documentToEntity(doc: ContractDocument): Contract {
    const partyA = new Party(
      doc.partyA.id,
      doc.partyA.address,
      doc.partyA.name,
      doc.partyA.description
    );
    
    const partyB = new Party(
      doc.partyB.id,
      doc.partyB.address,
      doc.partyB.name,
      doc.partyB.description
    );
    
    return new Contract(
      doc._id,
      doc.contractAddress,
      partyA,
      partyB,
      doc.bettingEndTime,
      doc.winnerRewardPercentage,
      doc.status,
      doc.winnerId,
      doc.creator,
      doc.topic,
      doc.description,
      doc.bettingStats
    );
  }

  private entityToDocument(contract: Contract): ContractDocument {
    return {
      _id: contract.id,
      contractAddress: contract.contractAddress,
      partyA: {
        id: contract.partyA.id,
        address: contract.partyA.address,
        name: contract.partyA.name,
        description: contract.partyA.description
      },
      partyB: {
        id: contract.partyB.id,
        address: contract.partyB.address,
        name: contract.partyB.name,
        description: contract.partyB.description
      },
      bettingEndTime: contract.bettingEndTime,
      winnerRewardPercentage: contract.winnerRewardPercentage,
      status: contract.status,
      winnerId: contract.winnerId,
      creator: contract.creator,
      topic: contract.topic,
      description: contract.description,
      bettingStats: contract.bettingStats,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}