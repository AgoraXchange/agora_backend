import { injectable, inject } from 'inversify';
import { Collection } from 'mongodb';
import { IActivityLogRepository } from '../../domain/repositories/IActivityLogRepository';
import { ActivityLog, ActivityAction, ActivityMetadata } from '../../domain/entities/ActivityLog';
import { MongoDBConnection } from '../database/MongoDBConnection';
import { logger } from '../logging/Logger';

interface ActivityLogDocument {
  _id: string;
  userId: string;
  username: string;
  action: ActivityAction;
  resource: string;
  resourceId: string;
  metadata: ActivityMetadata;
  ip: string;
  userAgent: string;
  timestamp: Date;
}

@injectable()
export class MongoActivityLogRepository implements IActivityLogRepository {
  private collection: Collection<ActivityLogDocument>;

  constructor(
    @inject('MongoDBConnection') private dbConnection: MongoDBConnection
  ) {
    this.collection = this.dbConnection.getDb().collection<ActivityLogDocument>('activityLogs');
    this.createIndexes();
  }

  private async createIndexes(): Promise<void> {
    try {
      await this.collection.createIndexes([
        { key: { userId: 1, timestamp: -1 } },
        { key: { action: 1, timestamp: -1 } },
        { key: { resource: 1, resourceId: 1, timestamp: -1 } },
        { key: { timestamp: -1 } },
        { key: { 'metadata.success': 1, timestamp: -1 } },
        // TTL index for automatic cleanup (optional - keeps logs for 1 year)
        { key: { timestamp: 1 }, expireAfterSeconds: 365 * 24 * 60 * 60 }
      ]);
    } catch (error) {
      logger.warn('Failed to create indexes for activity logs collection', { error });
    }
  }

  async save(log: ActivityLog): Promise<void> {
    try {
      const doc = this.logToDocument(log);
      await this.collection.insertOne(doc);
    } catch (error) {
      logger.error('Failed to save activity log', { logId: log.id, error });
      // Don't throw - logging failures shouldn't break the main operation
    }
  }

  async findById(id: string): Promise<ActivityLog | null> {
    try {
      const doc = await this.collection.findOne({ _id: id });
      return doc ? this.documentToLog(doc) : null;
    } catch (error) {
      logger.error('Failed to find activity log by id', { id, error });
      throw error;
    }
  }

  async findByUserId(userId: string, options: {
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{
    logs: ActivityLog[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const filter: any = { userId };
    this.addDateFilter(filter, options.startDate, options.endDate);

    return this.findWithPagination(filter, options);
  }

  async findByAction(action: ActivityAction, options: {
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{
    logs: ActivityLog[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const filter: any = { action };
    this.addDateFilter(filter, options.startDate, options.endDate);

    return this.findWithPagination(filter, options);
  }

  async findByResource(resource: string, resourceId?: string, options: {
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{
    logs: ActivityLog[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const filter: any = { resource };
    if (resourceId) {
      filter.resourceId = resourceId;
    }
    this.addDateFilter(filter, options.startDate, options.endDate);

    return this.findWithPagination(filter, options);
  }

  async findAll(options: {
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    action?: ActivityAction;
    resource?: string;
  } = {}): Promise<{
    logs: ActivityLog[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const filter: any = {};

    if (options.userId) filter.userId = options.userId;
    if (options.action) filter.action = options.action;
    if (options.resource) filter.resource = options.resource;

    this.addDateFilter(filter, options.startDate, options.endDate);

    return this.findWithPagination(filter, options);
  }

  async count(): Promise<number> {
    try {
      return await this.collection.countDocuments();
    } catch (error) {
      logger.error('Failed to count activity logs', { error });
      throw error;
    }
  }

  async getCriticalLogs(options: {
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{
    logs: ActivityLog[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const criticalActions = [
      ActivityAction.USER_DELETE,
      ActivityAction.CONTRACT_DELETE,
      ActivityAction.SYSTEM_CONFIG_UPDATE,
      ActivityAction.BACKUP_RESTORE
    ];

    const filter: any = { action: { $in: criticalActions } };
    this.addDateFilter(filter, options.startDate, options.endDate);

    return this.findWithPagination(filter, options);
  }

  async getFailedActions(options: {
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{
    logs: ActivityLog[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const filter: any = { 'metadata.success': false };
    this.addDateFilter(filter, options.startDate, options.endDate);

    return this.findWithPagination(filter, options);
  }

  async deleteOldLogs(olderThan: Date): Promise<number> {
    try {
      const result = await this.collection.deleteMany({
        timestamp: { $lt: olderThan }
      });

      logger.info('Old activity logs deleted', {
        deletedCount: result.deletedCount,
        olderThan
      });

      return result.deletedCount || 0;
    } catch (error) {
      logger.error('Failed to delete old activity logs', { olderThan, error });
      throw error;
    }
  }

  private async findWithPagination(filter: any, options: {
    page?: number;
    limit?: number;
  } = {}): Promise<{
    logs: ActivityLog[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 50;
      const skip = (page - 1) * limit;

      const [docs, total] = await Promise.all([
        this.collection
          .find(filter)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        this.collection.countDocuments(filter)
      ]);

      const logs = docs.map(doc => this.documentToLog(doc));
      const totalPages = Math.ceil(total / limit);

      return { logs, total, page, totalPages };
    } catch (error) {
      logger.error('Failed to find activity logs with pagination', { filter, options, error });
      throw error;
    }
  }

  private addDateFilter(filter: any, startDate?: Date, endDate?: Date): void {
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = startDate;
      if (endDate) filter.timestamp.$lte = endDate;
    }
  }

  private documentToLog(doc: ActivityLogDocument): ActivityLog {
    return new ActivityLog(
      doc._id,
      doc.userId,
      doc.username,
      doc.action,
      doc.resource,
      doc.resourceId,
      doc.metadata,
      doc.ip,
      doc.userAgent,
      doc.timestamp
    );
  }

  private logToDocument(log: ActivityLog): ActivityLogDocument {
    return {
      _id: log.id,
      userId: log.userId,
      username: log.username,
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      metadata: log.metadata,
      ip: log.ip,
      userAgent: log.userAgent,
      timestamp: log.timestamp
    };
  }
}