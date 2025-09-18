import { ActivityLog, ActivityAction } from '../entities/ActivityLog';

export interface IActivityLogRepository {
  save(log: ActivityLog): Promise<void>;
  findById(id: string): Promise<ActivityLog | null>;
  findByUserId(userId: string, options?: {
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    logs: ActivityLog[];
    total: number;
    page: number;
    totalPages: number;
  }>;
  findByAction(action: ActivityAction, options?: {
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    logs: ActivityLog[];
    total: number;
    page: number;
    totalPages: number;
  }>;
  findByResource(resource: string, resourceId?: string, options?: {
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    logs: ActivityLog[];
    total: number;
    page: number;
    totalPages: number;
  }>;
  findAll(options?: {
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    action?: ActivityAction;
    resource?: string;
  }): Promise<{
    logs: ActivityLog[];
    total: number;
    page: number;
    totalPages: number;
  }>;
  count(): Promise<number>;
  getCriticalLogs(options?: {
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    logs: ActivityLog[];
    total: number;
    page: number;
    totalPages: number;
  }>;
  getFailedActions(options?: {
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    logs: ActivityLog[];
    total: number;
    page: number;
    totalPages: number;
  }>;
  deleteOldLogs(olderThan: Date): Promise<number>;
}