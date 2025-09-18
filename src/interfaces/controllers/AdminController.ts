import { Request, Response } from 'express';
import { injectable, inject } from 'inversify';
import { TYPES } from '../../types';
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

// Admin repositories
import { IPromptTemplateRepository } from '../../admin/domain/repositories/IPromptTemplateRepository';
import { IPostRepository } from '../../admin/domain/repositories/IPostRepository';
import { ICommentRepository } from '../../admin/domain/repositories/ICommentRepository';
import { PromptStatus, PromptTemplate, PromptCategory, PromptLanguage } from '../../admin/domain/entities/PromptTemplate';
import { ContractStatus } from '../../domain/entities/Contract';

@injectable()
export class AdminController {
  constructor(
    @inject(TYPES.IUserRepository) private userRepository: IUserRepository,
    @inject(TYPES.IContractRepository) private contractRepository: IContractRepository,
    @inject(TYPES.IOracleDecisionRepository) private decisionRepository: IOracleDecisionRepository,
    @inject(TYPES.IActivityLogRepository) private activityLogRepository: IActivityLogRepository,
    @inject(TYPES.IBlockchainService) private blockchainService: IBlockchainService,
    @inject(TYPES.JwtService) private jwtService: JwtService,
    @inject(TYPES.IPromptTemplateRepository) private promptTemplateRepository: IPromptTemplateRepository,
    @inject(TYPES.IPostRepository) private postRepository: IPostRepository,
    @inject(TYPES.ICommentRepository) private commentRepository: ICommentRepository
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

  // Seed initial prompt templates from hardcoded proposer prompts
  async seedPromptTemplates(req: Request, res: Response): Promise<void> {
    try {
      // Check if templates already exist
      const existingCount = await this.promptTemplateRepository.count();
      if (existingCount > 0) {
        res.json({
          success: true,
          message: 'Prompt templates already exist',
          count: existingCount
        });
        return;
      }

      const initialTemplates = [
        // GPT-5 Proposer Template
        {
          id: `prompt_gpt5_${Date.now()}`,
          name: 'GPT-5 Proposer Analysis',
          category: PromptCategory.PROPOSER,
          language: PromptLanguage.EN,
          status: PromptStatus.ACTIVE,
          systemPrompt: `Expert analyst evaluating debate. Analyze parties objectively and decide winner.

Return JSON:
{
  "winner": "partyA" or "partyB",
  "confidence": 0.0-1.0,
  "rationale": "brief reasoning (max 100 words)",
  "evidence": ["key point 1", "key point 2"],
  "methodology": "analysis method"
}`,
          userPromptTemplate: `Contract {CONTRACT_ID}

Party A: {PARTY_A_NAME} ({PARTY_A_ADDRESS})
{PARTY_A_DESCRIPTION}

Party B: {PARTY_B_NAME} ({PARTY_B_ADDRESS})
{PARTY_B_DESCRIPTION}

Context: {CONTEXT}

Determine winner. Return JSON.`,
          variables: ['CONTRACT_ID', 'PARTY_A_NAME', 'PARTY_A_ADDRESS', 'PARTY_A_DESCRIPTION', 'PARTY_B_NAME', 'PARTY_B_ADDRESS', 'PARTY_B_DESCRIPTION', 'CONTEXT'],
          temperature: 0.7,
          maxTokens: 2000,
          description: 'Default GPT-5 proposer template for debate analysis',
          tags: ['gpt5', 'analysis', 'debate']
        },
        // Judge Template (generic)
        {
          id: `prompt_judge_${Date.now()}`,
          name: 'Judge Decision Template',
          category: PromptCategory.JUDGE,
          language: PromptLanguage.EN,
          status: PromptStatus.ACTIVE,
          systemPrompt: `You are an impartial judge evaluating a debate between two parties. Make your decision based on evidence, reasoning quality, and argument strength.

Provide your decision in JSON format with clear rationale.`,
          userPromptTemplate: `Judge the following debate:

Contract: {CONTRACT_ID}
Topic: {TOPIC}

Party A Position: {PARTY_A_DESCRIPTION}
Party B Position: {PARTY_B_DESCRIPTION}

Additional Context: {CONTEXT}

Provide your judgment with rationale.`,
          variables: ['CONTRACT_ID', 'TOPIC', 'PARTY_A_DESCRIPTION', 'PARTY_B_DESCRIPTION', 'CONTEXT'],
          temperature: 0.3,
          maxTokens: 1500,
          description: 'Template for final judge decisions in debates',
          tags: ['judge', 'decision', 'final']
        },
        // Synthesizer Template
        {
          id: `prompt_synthesizer_${Date.now()}`,
          name: 'Consensus Synthesizer',
          category: PromptCategory.SYNTHESIZER,
          language: PromptLanguage.EN,
          status: PromptStatus.ACTIVE,
          systemPrompt: `You are responsible for synthesizing multiple opinions into a consensus decision. Analyze all provided opinions and create a balanced final assessment.`,
          userPromptTemplate: `Synthesize the following opinions for contract {CONTRACT_ID}:

{OPINIONS}

Topic: {TOPIC}
Context: {CONTEXT}

Provide a consensus decision with supporting rationale.`,
          variables: ['CONTRACT_ID', 'OPINIONS', 'TOPIC', 'CONTEXT'],
          temperature: 0.4,
          maxTokens: 1800,
          description: 'Template for synthesizing multiple AI agent opinions',
          tags: ['synthesizer', 'consensus', 'aggregation']
        }
      ];

      let createdCount = 0;
      for (const templateData of initialTemplates) {
        const template = new PromptTemplate(
          templateData.id,
          templateData.name,
          templateData.category,
          templateData.language,
          templateData.status,
          '1.0.0', // currentVersion
          'admin' // createdBy
        );

        // Add initial version
        template.addVersion(
          {
            systemPrompt: templateData.systemPrompt,
            userPromptTemplate: templateData.userPromptTemplate,
            variables: templateData.variables
          },
          {
            temperature: templateData.temperature,
            maxTokens: templateData.maxTokens,
            version: '1.0.0',
            description: templateData.description,
            tags: templateData.tags
          },
          'admin', // createdBy
          'Initial template creation'
        );

        await this.promptTemplateRepository.save(template);
        createdCount++;
      }

      res.json({
        success: true,
        message: `Created ${createdCount} initial prompt templates`,
        count: createdCount
      });
    } catch (error) {
      logger.error('Seed prompt templates error', { error });
      throw AppError.internal('Failed to seed prompt templates');
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

  // Frontend-compatible endpoints
  async getDashboardStats(req: Request, res: Response): Promise<void> {
    try {
      const [
        userCount,
        contractCount,
        decisionCount,
        recentActivityCount,
        promptTemplateStats,
        totalComments
      ] = await Promise.all([
        this.userRepository.count(),
        this.contractRepository.count(),
        this.decisionRepository.count(),
        this.activityLogRepository.count(),
        this.promptTemplateRepository.count({ status: PromptStatus.ACTIVE }),
        this.commentRepository.count()
      ]);

      // Get usage statistics for prompt templates
      const usageStats = await this.promptTemplateRepository.getUsageStats();
      const totalUsage = usageStats.reduce((sum, stat) => sum + stat.totalUsage, 0);
      const avgSuccessRate = usageStats.length > 0
        ? usageStats.reduce((sum, stat) => sum + stat.successRate, 0) / usageStats.length
        : 0;

      // Count contracts by status for posts stats
      const allContracts = await this.contractRepository.findContractsReadyForDecision();
      const publishedContracts = allContracts.filter(c =>
        c.status === ContractStatus.BETTING_OPEN ||
        c.status === ContractStatus.BETTING_CLOSED ||
        c.status === ContractStatus.DECIDED
      );
      const draftContracts = allContracts.filter(c => c.status === ContractStatus.CREATED);

      const stats = {
        promptTemplates: {
          totalActive: promptTemplateStats,
          totalUsage,
          averageSuccessRate: Math.round(avgSuccessRate * 100) / 100
        },
        posts: {
          total: contractCount,
          published: publishedContracts.length,
          drafts: draftContracts.length,
          scheduled: 0,
          totalViews: allContracts.reduce((sum, contract) =>
            sum + Number(contract.bettingStats?.totalAmount || 0), 0),
          totalLikes: 0 // Could be calculated from user interactions if available
        },
        comments: {
          total: totalComments,
          pending: 0, // Would need comment status filtering
          approved: totalComments,
          flagged: 0,
          spam: 0,
          needingAttention: 0
        }
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Dashboard stats error', { error });
      throw AppError.internal('Failed to load dashboard statistics');
    }
  }

  // Content Management endpoints (Mock implementations)
  async getPromptTemplates(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const category = req.query.category as string;
      const status = req.query.status as string;
      const search = req.query.search as string;

      const filter: any = {};
      if (category) filter.category = category;
      if (status) filter.status = status;
      if (search) filter.search = search;

      const result = await this.promptTemplateRepository.findMany(
        filter,
        { page, limit, sortBy: 'createdAt', sortOrder: 'desc' }
      );

      // Map to frontend format
      const templates = result.templates.map(template => {
        const currentVersionData = template.currentVersionData;
        return {
          id: template.id,
          name: template.name,
          category: template.category,
          language: template.language,
          status: template.status,
          template: currentVersionData ?
            currentVersionData.content.systemPrompt + '\n\n' + currentVersionData.content.userPromptTemplate :
            'No template content available',
          variables: currentVersionData?.content.variables || [],
          description: currentVersionData?.metadata.description || '',
          version: currentVersionData?.version || '1.0.0',
          isActive: template.status === PromptStatus.ACTIVE,
          successRate: currentVersionData?.performanceMetrics?.successRate || 0,
          averageResponseTime: currentVersionData?.performanceMetrics?.averageResponseTime || 0,
          usageCount: currentVersionData?.performanceMetrics?.usageCount || 0,
          createdBy: template.createdBy,
          createdAt: template.createdAt.toISOString(),
          updatedAt: template.updatedAt.toISOString(),
          tags: currentVersionData?.metadata.tags || [],
          notes: ''
        };
      });

      res.json({
        data: templates,
        pagination: {
          page: result.page,
          limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });
    } catch (error) {
      logger.error('Get prompt templates error', { error });
      throw AppError.internal('Failed to retrieve prompt templates');
    }
  }

  async getPosts(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      // For now, fetch all contracts and map them to posts format
      // In the future, this could be improved with proper pagination in the repository
      const allContracts = await this.contractRepository.findContractsReadyForDecision();
      const totalContracts = await this.contractRepository.count();

      // Map contracts to posts format
      const contractPosts = allContracts.map(contract => {
        const statusMap = {
          [ContractStatus.CREATED]: 'draft',
          [ContractStatus.BETTING_OPEN]: 'published',
          [ContractStatus.BETTING_CLOSED]: 'published',
          [ContractStatus.DECIDED]: 'published',
          [ContractStatus.DISTRIBUTED]: 'archived'
        };

        return {
          id: contract.id,
          title: contract.topic || `Debate: ${contract.partyA.name} vs ${contract.partyB.name}`,
          content: `Debate between ${contract.partyA.name} and ${contract.partyB.name}.

Party A (${contract.partyA.name}): ${contract.partyA.description || 'No description available'}

Party B (${contract.partyB.name}): ${contract.partyB.description || 'No description available'}

Winner Reward: ${contract.winnerRewardPercentage}%
Betting ends: ${contract.bettingEndTime.toISOString()}

Contract Address: ${contract.contractAddress}`,
          summary: contract.description || `Debate between ${contract.partyA.name} and ${contract.partyB.name}`,
          status: statusMap[contract.status] || 'draft',
          category: 'debate',
          authorId: contract.creator || 'system',
          authorName: contract.creator || 'System',
          createdAt: new Date().toISOString(), // Contracts don't have created date, using current date
          updatedAt: new Date().toISOString(),
          publishedAt: contract.status !== ContractStatus.CREATED ? new Date().toISOString() : null,
          scheduledAt: null,
          tags: ['debate', 'contract', contract.status.toLowerCase()],
          viewCount: Math.floor(Number(contract.bettingStats?.totalAmount || 0) / 1000), // Use bet amount as view proxy
          likeCount: Math.floor(Number(contract.bettingStats?.uniqueParticipants || 0) / 10), // Use participant count as like proxy
          allowComments: true,
          pinned: contract.status === ContractStatus.DECIDED,
          slug: `debate-${contract.id}`,
          isPublished: contract.status !== ContractStatus.CREATED,
          isScheduled: false,
          estimatedReadingTime: 5
        };
      });

      // Simple pagination
      const startIndex = (page - 1) * limit;
      const paginatedPosts = contractPosts.slice(startIndex, startIndex + limit);

      res.json({
        data: paginatedPosts,
        pagination: {
          page,
          limit,
          total: totalContracts,
          totalPages: Math.ceil(totalContracts / limit)
        }
      });
    } catch (error) {
      logger.error('Get posts error', { error });
      throw AppError.internal('Failed to retrieve posts');
    }
  }

  async getComments(req: Request, res: Response): Promise<void> {
    const mockComments = [
      {
        id: '1',
        content: '좋은 의견이네요!',
        author: 'user1',
        authorName: '사용자1',
        status: 'approved',
        parentType: 'post',
        parentId: '1',
        supportingSide: 'argument_a',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        upvotes: 5,
        downvotes: 1,
        netVotes: 4,
        flagCount: 0,
        isFlagged: false,
        isReply: false,
        isModerated: true,
        moderatedBy: 'admin',
        moderatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString()
      }
    ];

    res.json({
      data: mockComments,
      pagination: {
        page: 1,
        limit: 20,
        total: mockComments.length,
        totalPages: 1
      }
    });
  }

  async getContentAnalytics(req: Request, res: Response): Promise<void> {
    const mockAnalytics = {
      totalContent: 156,
      publishedContent: 142,
      draftContent: 14,
      totalViews: 12540,
      totalEngagements: 3287,
      topContent: [
        {
          id: '1',
          title: '인기 게시물',
          views: 1250,
          engagements: 340
        }
      ],
      contentByDate: [
        {
          date: new Date().toISOString().split('T')[0],
          published: 5,
          views: 450,
          engagements: 120
        }
      ]
    };

    res.json({
      success: true,
      data: mockAnalytics
    });
  }

  async getEngagementAnalytics(req: Request, res: Response): Promise<void> {
    const mockEngagement = {
      totalUsers: 1248,
      activeUsers: 842,
      newUsers: 156,
      userRetention: 73.2,
      avgSessionDuration: 8.5,
      engagementByDate: [
        {
          date: new Date().toISOString().split('T')[0],
          activeUsers: 125,
          sessions: 340,
          avgDuration: 9.2
        }
      ],
      topEngagedUsers: [
        {
          id: '1',
          username: 'user1',
          engagementScore: 95.4,
          totalSessions: 45
        }
      ]
    };

    res.json({
      success: true,
      data: mockEngagement
    });
  }
}