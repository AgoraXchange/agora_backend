import { Request, Response } from 'express';
import { injectable, inject } from 'inversify';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IContractRepository } from '../../domain/repositories/IContractRepository';
import { IOracleDecisionRepository } from '../../domain/repositories/IOracleDecisionRepository';
import { IActivityLogRepository } from '../../domain/repositories/IActivityLogRepository';
import { IBlockchainService } from '../../domain/services/IBlockchainService';
import { JwtService } from '../../infrastructure/auth/JwtService';
import { User, UserRole } from '../../domain/entities/User';
import { ActivityLog, ActivityAction } from '../../domain/entities/ActivityLog';
import { AppError } from '../../domain/errors/AppError';
import { logger } from '../../infrastructure/logging/Logger';

@injectable()
export class AdminController {
  constructor(
    @inject('IUserRepository') private userRepository: IUserRepository,
    @inject('IContractRepository') private contractRepository: IContractRepository,
    @inject('IOracleDecisionRepository') private decisionRepository: IOracleDecisionRepository,
    @inject('IActivityLogRepository') private activityLogRepository: IActivityLogRepository,
    @inject('IBlockchainService') private blockchainService: IBlockchainService,
    @inject('JwtService') private jwtService: JwtService
  ) {}

  // Dashboard endpoints
  async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const [
        userCount,
        contractCount,
        decisionCount,
        recentActivityCount,
        healthStatus
      ] = await Promise.all([
        this.userRepository.count(),
        this.contractRepository.count(),
        this.decisionRepository.count(),
        this.activityLogRepository.count(),
        this.getSystemHealth()
      ]);

      const dashboard = {
        stats: {
          totalUsers: userCount,
          totalContracts: contractCount,
          totalDecisions: decisionCount,
          totalActivityLogs: recentActivityCount
        },
        health: healthStatus,
        timestamp: new Date()
      };

      res.json({
        success: true,
        data: dashboard
      });
    } catch (error) {
      logger.error('Dashboard error', { error });
      throw AppError.internal('Failed to load dashboard');
    }
  }

  async getSystemStats(req: Request, res: Response): Promise<void> {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      const [
        recentActivity,
        failedActions,
        criticalLogs
      ] = await Promise.all([
        this.activityLogRepository.findAll({
          page: 1,
          limit: 10,
          startDate,
          endDate
        }),
        this.activityLogRepository.getFailedActions({
          page: 1,
          limit: 5,
          startDate,
          endDate
        }),
        this.activityLogRepository.getCriticalLogs({
          page: 1,
          limit: 5,
          startDate,
          endDate
        })
      ]);

      const stats = {
        recentActivity: recentActivity.logs,
        failedActions: failedActions.logs,
        criticalLogs: criticalLogs.logs,
        summary: {
          totalRecentActivity: recentActivity.total,
          totalFailedActions: failedActions.total,
          totalCriticalActions: criticalLogs.total
        }
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('System stats error', { error });
      throw AppError.internal('Failed to load system statistics');
    }
  }

  async getSystemHealth(req?: Request, res?: Response): Promise<any> {
    const healthChecks = {
      database: 'unknown',
      blockchain: 'unknown',
      ai: 'unknown'
    };

    try {
      // Check database health
      await this.userRepository.count();
      healthChecks.database = 'healthy';
    } catch (error) {
      healthChecks.database = 'error';
      logger.warn('Database health check failed', { error });
    }

    try {
      // Check blockchain service
      await this.blockchainService.isAuthorizedOracle();
      healthChecks.blockchain = 'healthy';
    } catch (error) {
      healthChecks.blockchain = 'error';
      logger.warn('Blockchain health check failed', { error });
    }

    // AI service health check would go here
    // For now, we'll assume it's healthy if the environment variables are set
    if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) {
      healthChecks.ai = 'healthy';
    } else {
      healthChecks.ai = 'error';
    }

    const overallHealth = Object.values(healthChecks).every(status => status === 'healthy')
      ? 'healthy' : 'degraded';

    const result = {
      overall: overallHealth,
      services: healthChecks,
      timestamp: new Date()
    };

    if (res) {
      res.json({
        success: true,
        data: result
      });
    }

    return result;
  }

  // User management endpoints
  async getUsers(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const role = req.query.role as string;

      const result = await this.userRepository.findAll({
        page,
        limit,
        role
      });

      // Remove password hashes from response
      const safeUsers = result.users.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        active: user.active,
        apiKeys: user.apiKeys.map(key => ({
          name: key.name,
          createdAt: key.createdAt,
          lastUsedAt: key.lastUsedAt,
          active: key.active
        })),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt
      }));

      res.json({
        success: true,
        data: {
          users: safeUsers,
          total: result.total,
          page: result.page,
          totalPages: result.totalPages
        }
      });
    } catch (error) {
      logger.error('Get users error', { error });
      throw AppError.internal('Failed to retrieve users');
    }
  }

  async createUser(req: Request, res: Response): Promise<void> {
    const { username, email, password, role } = req.body;

    try {
      // Validate role
      if (!Object.values(UserRole).includes(role)) {
        throw AppError.badRequest('Invalid user role');
      }

      // Check if user already exists
      const existingUser = await this.userRepository.findByUsername(username);
      if (existingUser) {
        throw AppError.conflict('Username already exists');
      }

      // Hash password
      const passwordHash = await this.jwtService.hashPassword(password);

      // Create new user
      const newUser = new User(
        `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        username,
        passwordHash,
        role,
        email
      );

      await this.userRepository.save(newUser);

      // Log activity
      await this.logActivity(
        req.user!.userId,
        req.user!.username,
        ActivityAction.USER_CREATE,
        'user',
        newUser.id,
        {
          success: true,
          newUserId: newUser.id,
          newUsername: username,
          role
        },
        req.ip || 'unknown',
        req.headers['user-agent'] || 'unknown'
      );

      logger.info('User created', {
        adminId: req.user!.userId,
        newUserId: newUser.id,
        username
      });

      res.status(201).json({
        success: true,
        data: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
          active: newUser.active,
          createdAt: newUser.createdAt
        }
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Create user error', { error });
      throw AppError.internal('Failed to create user');
    }
  }

  async updateUser(req: Request, res: Response): Promise<void> {
    const { userId } = req.params;
    const { email, role, active } = req.body;

    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw AppError.notFound('User not found');
      }

      // Prevent admin from deactivating themselves
      if (userId === req.user!.userId && active === false) {
        throw AppError.badRequest('Cannot deactivate your own account');
      }

      const oldValues = {
        email: user.email,
        role: user.role,
        active: user.active
      };

      // Update user properties
      if (email !== undefined) {
        (user as any).email = email;
      }
      if (role !== undefined) {
        if (!Object.values(UserRole).includes(role)) {
          throw AppError.badRequest('Invalid user role');
        }
        (user as any).role = role;
      }
      if (active !== undefined) {
        (user as any).active = active;
      }

      await this.userRepository.update(user);

      // Log activity
      await this.logActivity(
        req.user!.userId,
        req.user!.username,
        ActivityAction.USER_UPDATE,
        'user',
        userId,
        {
          success: true,
          oldValues,
          newValues: { email, role, active }
        },
        req.ip || 'unknown',
        req.headers['user-agent'] || 'unknown'
      );

      logger.info('User updated', {
        adminId: req.user!.userId,
        updatedUserId: userId
      });

      res.json({
        success: true,
        data: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          active: user.active,
          updatedAt: user.updatedAt
        }
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Update user error', { userId, error });
      throw AppError.internal('Failed to update user');
    }
  }

  async deleteUser(req: Request, res: Response): Promise<void> {
    const { userId } = req.params;

    try {
      // Prevent admin from deleting themselves
      if (userId === req.user!.userId) {
        throw AppError.badRequest('Cannot delete your own account');
      }

      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw AppError.notFound('User not found');
      }

      await this.userRepository.delete(userId);

      // Log activity
      await this.logActivity(
        req.user!.userId,
        req.user!.username,
        ActivityAction.USER_DELETE,
        'user',
        userId,
        {
          success: true,
          deletedUsername: user.username,
          deletedRole: user.role
        },
        req.ip || 'unknown',
        req.headers['user-agent'] || 'unknown'
      );

      logger.info('User deleted', {
        adminId: req.user!.userId,
        deletedUserId: userId,
        deletedUsername: user.username
      });

      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Delete user error', { userId, error });
      throw AppError.internal('Failed to delete user');
    }
  }

  // Activity log endpoints
  async getActivityLogs(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const userId = req.query.userId as string;
      const action = req.query.action as ActivityAction;
      const resource = req.query.resource as string;

      const result = await this.activityLogRepository.findAll({
        page,
        limit,
        userId,
        action,
        resource
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Get activity logs error', { error });
      throw AppError.internal('Failed to retrieve activity logs');
    }
  }

  private async logActivity(
    userId: string,
    username: string,
    action: ActivityAction,
    resource: string,
    resourceId: string,
    metadata: any,
    ip: string,
    userAgent: string
  ): Promise<void> {
    try {
      const log = ActivityLog.create(
        userId,
        username,
        action,
        resource,
        resourceId,
        metadata,
        ip,
        userAgent
      );
      await this.activityLogRepository.save(log);
    } catch (error) {
      logger.warn('Failed to log activity', { action, userId, error });
      // Don't throw - logging failures shouldn't break main operations
    }
  }
}