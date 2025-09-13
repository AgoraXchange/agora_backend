import { injectable } from 'inversify';
import { IActivityLogRepository } from '../../domain/repositories/IActivityLogRepository';
import { ActivityLog, ActivityAction } from '../../domain/entities/ActivityLog';
import { logger } from '../logging/Logger';

@injectable()
export class InMemoryActivityLogRepository implements IActivityLogRepository {
  private logs: Map<string, ActivityLog> = new Map();

  async save(log: ActivityLog): Promise<void> {
    try {
      this.logs.set(log.id, log);
    } catch (error) {
      logger.error('Failed to save activity log', { logId: log.id, error });
      // Don't throw - logging failures shouldn't break the main operation
    }
  }

  async findById(id: string): Promise<ActivityLog | null> {
    return this.logs.get(id) || null;
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
    const filteredLogs = Array.from(this.logs.values()).filter(log => {
      return log.userId === userId && this.isWithinDateRange(log, options.startDate, options.endDate);
    });

    return this.paginateLogs(filteredLogs, options);
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
    const filteredLogs = Array.from(this.logs.values()).filter(log => {
      return log.action === action && this.isWithinDateRange(log, options.startDate, options.endDate);
    });

    return this.paginateLogs(filteredLogs, options);
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
    const filteredLogs = Array.from(this.logs.values()).filter(log => {
      const resourceMatch = log.resource === resource;
      const resourceIdMatch = !resourceId || log.resourceId === resourceId;
      const dateMatch = this.isWithinDateRange(log, options.startDate, options.endDate);

      return resourceMatch && resourceIdMatch && dateMatch;
    });

    return this.paginateLogs(filteredLogs, options);
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
    const filteredLogs = Array.from(this.logs.values()).filter(log => {
      const userMatch = !options.userId || log.userId === options.userId;
      const actionMatch = !options.action || log.action === options.action;
      const resourceMatch = !options.resource || log.resource === options.resource;
      const dateMatch = this.isWithinDateRange(log, options.startDate, options.endDate);

      return userMatch && actionMatch && resourceMatch && dateMatch;
    });

    return this.paginateLogs(filteredLogs, options);
  }

  async count(): Promise<number> {
    return this.logs.size;
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
    const filteredLogs = Array.from(this.logs.values()).filter(log => {
      const isCritical = log.isCriticalAction();
      const dateMatch = this.isWithinDateRange(log, options.startDate, options.endDate);

      return isCritical && dateMatch;
    });

    return this.paginateLogs(filteredLogs, options);
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
    const filteredLogs = Array.from(this.logs.values()).filter(log => {
      const isFailed = !log.isSuccessful();
      const dateMatch = this.isWithinDateRange(log, options.startDate, options.endDate);

      return isFailed && dateMatch;
    });

    return this.paginateLogs(filteredLogs, options);
  }

  async deleteOldLogs(olderThan: Date): Promise<number> {
    let deletedCount = 0;

    for (const [id, log] of this.logs.entries()) {
      if (log.timestamp < olderThan) {
        this.logs.delete(id);
        deletedCount++;
      }
    }

    logger.info('Old activity logs deleted', { deletedCount, olderThan });
    return deletedCount;
  }

  private isWithinDateRange(log: ActivityLog, startDate?: Date, endDate?: Date): boolean {
    if (startDate && log.timestamp < startDate) return false;
    if (endDate && log.timestamp > endDate) return false;
    return true;
  }

  private paginateLogs(logs: ActivityLog[], options: {
    page?: number;
    limit?: number;
  } = {}): {
    logs: ActivityLog[];
    total: number;
    page: number;
    totalPages: number;
  } {
    const page = options.page || 1;
    const limit = options.limit || 50;
    const skip = (page - 1) * limit;

    // Sort by timestamp (newest first)
    const sortedLogs = logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const total = sortedLogs.length;
    const paginatedLogs = sortedLogs.slice(skip, skip + limit);
    const totalPages = Math.ceil(total / limit);

    return {
      logs: paginatedLogs,
      total,
      page,
      totalPages
    };
  }
}