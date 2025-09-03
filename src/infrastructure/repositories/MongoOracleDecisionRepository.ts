import { injectable, inject } from 'inversify';
import { Collection } from 'mongodb';
import { IOracleDecisionRepository } from '../../domain/repositories/IOracleDecisionRepository';
import { OracleDecision, DecisionMetadata } from '../../domain/entities/OracleDecision';
import { MongoDBConnection } from '../database/MongoDBConnection';
import { logger } from '../logging/Logger';

interface OracleDecisionDocument {
  _id: string;
  contractId: string;
  winnerId: string;
  metadata: {
    confidence: number;
    reasoning: string;
    dataPoints: Record<string, any>;
    timestamp: Date;
  };
  createdAt: Date;
}

@injectable()
export class MongoOracleDecisionRepository implements IOracleDecisionRepository {
  private collection: Collection<OracleDecisionDocument>;

  constructor(
    @inject('MongoDBConnection') private dbConnection: MongoDBConnection
  ) {
    this.collection = this.dbConnection.getDb().collection<OracleDecisionDocument>('oracleDecisions');
    this.createIndexes();
  }

  private async createIndexes(): Promise<void> {
    try {
      await this.collection.createIndex({ contractId: 1 }, { unique: true });
      await this.collection.createIndex({ winnerId: 1 });
      await this.collection.createIndex({ createdAt: -1 });
      logger.info('MongoDB indexes created for oracleDecisions collection');
    } catch (error) {
      logger.error('Failed to create indexes', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  async findById(id: string): Promise<OracleDecision | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? this.documentToEntity(doc) : null;
  }

  async findByContractId(contractId: string): Promise<OracleDecision | null> {
    const doc = await this.collection.findOne({ contractId });
    return doc ? this.documentToEntity(doc) : null;
  }

  async save(decision: OracleDecision): Promise<void> {
    const doc = this.entityToDocument(decision);
    await this.collection.insertOne(doc);
    logger.info('Oracle decision saved', { 
      decisionId: decision.id,
      contractId: decision.contractId 
    });
  }

  private documentToEntity(doc: OracleDecisionDocument): OracleDecision {
    const metadata: DecisionMetadata = {
      confidence: doc.metadata.confidence,
      reasoning: doc.metadata.reasoning,
      dataPoints: doc.metadata.dataPoints,
      timestamp: doc.metadata.timestamp
    };

    return new OracleDecision(
      doc._id,
      doc.contractId,
      doc.winnerId,
      metadata,
      doc.createdAt
    );
  }

  private entityToDocument(decision: OracleDecision): OracleDecisionDocument {
    return {
      _id: decision.id,
      contractId: decision.contractId,
      winnerId: decision.winnerId,
      metadata: {
        confidence: decision.metadata.confidence,
        reasoning: decision.metadata.reasoning,
        dataPoints: decision.metadata.dataPoints,
        timestamp: decision.metadata.timestamp
      },
      createdAt: decision.createdAt
    };
  }
}
