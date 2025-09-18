import { Request, Response } from 'express';
import { inject, injectable } from 'inversify';
import { PromptTemplateUseCases } from '../../application/useCases/PromptTemplateUseCases';
import { PostUseCases } from '../../application/useCases/PostUseCases';
import { CommentUseCases } from '../../application/useCases/CommentUseCases';
import { AppError } from '../../../domain/errors/AppError';
import { TYPES } from '../../../types';

@injectable()
export class AdminContentController {
  constructor(
    @inject(TYPES.PromptTemplateUseCases)
    private promptTemplateUseCases: PromptTemplateUseCases,
    @inject(TYPES.PostUseCases)
    private postUseCases: PostUseCases,
    @inject(TYPES.CommentUseCases)
    private commentUseCases: CommentUseCases
  ) {}

  // ============= PROMPT TEMPLATE ENDPOINTS =============

  async createPromptTemplate(req: Request, res: Response): Promise<void> {
    try {
      const adminId = req.user?.id;
      if (!adminId) {
        throw AppError.unauthorized('Admin authentication required');
      }

      const template = await this.promptTemplateUseCases.createPromptTemplate({
        ...req.body,
        createdBy: adminId
      });

      res.status(201).json({
        success: true,
        data: template.toJSON()
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getPromptTemplates(req: Request, res: Response): Promise<void> {
    try {
      const filter = this.buildPromptTemplateFilter(req.query);
      const pagination = this.buildPagination(req.query);

      const result = await this.promptTemplateUseCases.getPromptTemplates(filter, pagination);

      res.json({
        success: true,
        data: result.templates.map(t => t.toJSON()),
        pagination: {
          page: result.page,
          totalPages: result.totalPages,
          total: result.total
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getPromptTemplate(req: Request, res: Response): Promise<void> {
    try {
      const template = await this.promptTemplateUseCases.getPromptTemplate(req.params.id);
      if (!template) {
        throw AppError.notFound('Prompt template not found');
      }

      res.json({
        success: true,
        data: template.toJSON()
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async updatePromptTemplate(req: Request, res: Response): Promise<void> {
    try {
      const template = await this.promptTemplateUseCases.updatePromptTemplate({
        id: req.params.id,
        ...req.body
      });

      res.json({
        success: true,
        data: template.toJSON()
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async deletePromptTemplate(req: Request, res: Response): Promise<void> {
    try {
      await this.promptTemplateUseCases.deletePromptTemplate(req.params.id);
      res.json({ success: true });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async activatePromptTemplate(req: Request, res: Response): Promise<void> {
    try {
      const template = await this.promptTemplateUseCases.activateTemplate(req.params.id);
      res.json({
        success: true,
        data: template.toJSON()
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getPromptTemplateUsageStats(req: Request, res: Response): Promise<void> {
    try {
      const templateIds = req.query.templateIds as string[];
      const stats = await this.promptTemplateUseCases.getUsageStats(templateIds);
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async exportPromptTemplates(req: Request, res: Response): Promise<void> {
    try {
      const filter = this.buildPromptTemplateFilter(req.query);
      const exportData = await this.promptTemplateUseCases.exportTemplates(filter);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="prompt-templates.json"');
      res.send(exportData);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // ============= POST ENDPOINTS =============

  async createPost(req: Request, res: Response): Promise<void> {
    try {
      const adminId = req.user?.id;
      const adminName = req.user?.name || 'Admin';
      if (!adminId) {
        throw AppError.unauthorized('Admin authentication required');
      }

      const post = await this.postUseCases.createPost({
        ...req.body,
        authorId: adminId,
        authorName: adminName
      });

      res.status(201).json({
        success: true,
        data: post.toJSON()
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getPosts(req: Request, res: Response): Promise<void> {
    try {
      const filter = this.buildPostFilter(req.query);
      const pagination = this.buildPagination(req.query);

      const result = await this.postUseCases.getPosts(filter, pagination);

      res.json({
        success: true,
        data: result.posts.map(p => p.toJSON()),
        pagination: {
          page: result.page,
          totalPages: result.totalPages,
          total: result.total
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getPost(req: Request, res: Response): Promise<void> {
    try {
      const post = await this.postUseCases.getPost(req.params.id);
      if (!post) {
        throw AppError.notFound('Post not found');
      }

      res.json({
        success: true,
        data: post.toJSON()
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async updatePost(req: Request, res: Response): Promise<void> {
    try {
      const adminId = req.user?.id;
      if (!adminId) {
        throw AppError.unauthorized('Admin authentication required');
      }

      const post = await this.postUseCases.updatePost({
        id: req.params.id,
        ...req.body,
        modifiedBy: adminId
      });

      res.json({
        success: true,
        data: post.toJSON()
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async deletePost(req: Request, res: Response): Promise<void> {
    try {
      await this.postUseCases.deletePost(req.params.id);
      res.json({ success: true });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async publishPost(req: Request, res: Response): Promise<void> {
    try {
      const post = await this.postUseCases.publishPost(req.params.id);
      res.json({
        success: true,
        data: post.toJSON()
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async schedulePost(req: Request, res: Response): Promise<void> {
    try {
      const { scheduledAt } = req.body;
      const post = await this.postUseCases.schedulePost({
        id: req.params.id,
        scheduledAt: new Date(scheduledAt)
      });

      res.json({
        success: true,
        data: post.toJSON()
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getPostStats(req: Request, res: Response): Promise<void> {
    try {
      const filter = this.buildPostFilter(req.query);
      const stats = await this.postUseCases.getPostStats(filter);
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async bulkUpdatePosts(req: Request, res: Response): Promise<void> {
    try {
      const { postIds, updates } = req.body;
      await this.postUseCases.bulkUpdatePosts({ postIds, updates });
      res.json({ success: true });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // ============= COMMENT ENDPOINTS =============

  async getComments(req: Request, res: Response): Promise<void> {
    try {
      const filter = this.buildCommentFilter(req.query);
      const pagination = this.buildPagination(req.query);

      const result = await this.commentUseCases.getComments(filter, pagination);

      res.json({
        success: true,
        data: result.comments.map(c => c.toJSON()),
        pagination: {
          page: result.page,
          totalPages: result.totalPages,
          total: result.total
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getComment(req: Request, res: Response): Promise<void> {
    try {
      const comment = await this.commentUseCases.getComment(req.params.id);
      if (!comment) {
        throw AppError.notFound('Comment not found');
      }

      res.json({
        success: true,
        data: comment.toJSON()
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async moderateComment(req: Request, res: Response): Promise<void> {
    try {
      const adminId = req.user?.id;
      if (!adminId) {
        throw AppError.unauthorized('Admin authentication required');
      }

      const { action, reason } = req.body;
      const comment = await this.commentUseCases.moderateComment({
        id: req.params.id,
        action,
        moderatedBy: adminId,
        reason
      });

      res.json({
        success: true,
        data: comment.toJSON()
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async bulkModerateComments(req: Request, res: Response): Promise<void> {
    try {
      const adminId = req.user?.id;
      if (!adminId) {
        throw AppError.unauthorized('Admin authentication required');
      }

      const { commentIds, action } = req.body;
      const result = await this.commentUseCases.bulkModerate({
        commentIds,
        action,
        moderatedBy: adminId
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getFlaggedComments(req: Request, res: Response): Promise<void> {
    try {
      const unresolvedOnly = req.query.unresolvedOnly === 'true';
      const pagination = this.buildPagination(req.query);

      const result = await this.commentUseCases.getFlaggedComments(unresolvedOnly, pagination);

      res.json({
        success: true,
        data: result.comments.map(c => c.toJSON()),
        pagination: {
          page: result.page,
          totalPages: result.totalPages,
          total: result.total
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getPendingComments(req: Request, res: Response): Promise<void> {
    try {
      const pagination = this.buildPagination(req.query);
      const result = await this.commentUseCases.getPendingComments(pagination);

      res.json({
        success: true,
        data: result.comments.map(c => c.toJSON()),
        pagination: {
          page: result.page,
          totalPages: result.totalPages,
          total: result.total
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getCommentStats(req: Request, res: Response): Promise<void> {
    try {
      const filter = this.buildCommentFilter(req.query);
      const stats = await this.commentUseCases.getCommentStats(filter);
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async autoModerateComments(req: Request, res: Response): Promise<void> {
    try {
      const rules = req.body;
      const result = await this.commentUseCases.autoModerate(rules);
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async addAdminNote(req: Request, res: Response): Promise<void> {
    try {
      const adminId = req.user?.id;
      if (!adminId) {
        throw AppError.unauthorized('Admin authentication required');
      }

      const { note, isInternal } = req.body;
      const noteId = await this.commentUseCases.addAdminNote({
        commentId: req.params.id,
        note,
        addedBy: adminId,
        isInternal
      });

      res.json({
        success: true,
        data: { noteId }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async flagComment(req: Request, res: Response): Promise<void> {
    try {
      const adminId = req.user?.id;
      if (!adminId) {
        throw AppError.unauthorized('Admin authentication required');
      }

      const { reason, description } = req.body;
      const flagId = await this.commentUseCases.flagComment({
        id: req.params.id,
        flaggedBy: adminId,
        reason,
        description
      });

      res.json({
        success: true,
        data: { flagId }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getCommentsNeedingAttention(req: Request, res: Response): Promise<void> {
    try {
      const comments = await this.commentUseCases.getCommentsNeedingAttention();
      res.json({
        success: true,
        data: comments.map(c => c.toJSON())
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // ============= SHARED ANALYTICS ENDPOINTS =============

  async getDashboardStats(req: Request, res: Response): Promise<void> {
    try {
      const [
        promptTemplateStats,
        postStats,
        commentStats,
        commentsNeedingAttention
      ] = await Promise.all([
        this.promptTemplateUseCases.getUsageStats(),
        this.postUseCases.getPostStats(),
        this.commentUseCases.getCommentStats(),
        this.commentUseCases.getCommentsNeedingAttention()
      ]);

      res.json({
        success: true,
        data: {
          promptTemplates: {
            totalActive: promptTemplateStats.filter(t => t.totalUsage > 0).length,
            totalUsage: promptTemplateStats.reduce((sum, t) => sum + t.totalUsage, 0),
            averageSuccessRate: promptTemplateStats.reduce((sum, t) => sum + t.successRate, 0) / promptTemplateStats.length || 0
          },
          posts: {
            total: postStats.totalPosts,
            published: postStats.publishedPosts,
            drafts: postStats.draftPosts,
            scheduled: postStats.scheduledPosts,
            totalViews: postStats.totalViews,
            totalLikes: postStats.totalLikes
          },
          comments: {
            total: commentStats.totalComments,
            pending: commentStats.pendingComments,
            approved: commentStats.approvedComments,
            flagged: commentStats.flaggedComments,
            spam: commentStats.spamComments,
            needingAttention: commentsNeedingAttention.length
          }
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // ============= UTILITY METHODS =============

  private buildPromptTemplateFilter(query: any): any {
    const filter: any = {};
    if (query.category) filter.category = query.category;
    if (query.language) filter.language = query.language;
    if (query.status) filter.status = query.status;
    if (query.createdBy) filter.createdBy = query.createdBy;
    if (query.search) filter.search = query.search;
    if (query.tags) filter.tags = Array.isArray(query.tags) ? query.tags : [query.tags];
    return filter;
  }

  private buildPostFilter(query: any): any {
    const filter: any = {};
    if (query.status) filter.status = query.status;
    if (query.category) filter.category = query.category;
    if (query.authorId) filter.authorId = query.authorId;
    if (query.search) filter.search = query.search;
    if (query.featured !== undefined) filter.featured = query.featured === 'true';
    if (query.pinned !== undefined) filter.pinned = query.pinned === 'true';
    if (query.tags) filter.tags = Array.isArray(query.tags) ? query.tags : [query.tags];

    if (query.startDate && query.endDate) {
      filter.dateRange = {
        start: new Date(query.startDate),
        end: new Date(query.endDate)
      };
    }

    return filter;
  }

  private buildCommentFilter(query: any): any {
    const filter: any = {};
    if (query.parentId) filter.parentId = query.parentId;
    if (query.parentType) filter.parentType = query.parentType;
    if (query.author) filter.author = query.author;
    if (query.status) filter.status = query.status;
    if (query.supportingSide) filter.supportingSide = query.supportingSide;
    if (query.isFlagged !== undefined) filter.isFlagged = query.isFlagged === 'true';
    if (query.isSpam !== undefined) filter.isSpam = query.isSpam === 'true';
    if (query.search) filter.search = query.search;

    if (query.startDate && query.endDate) {
      filter.dateRange = {
        start: new Date(query.startDate),
        end: new Date(query.endDate)
      };
    }

    return filter;
  }

  private buildPagination(query: any): any {
    return {
      page: parseInt(query.page) || 1,
      limit: Math.min(parseInt(query.limit) || 20, 100), // Max 100 items per page
      sortBy: query.sortBy,
      sortOrder: query.sortOrder === 'asc' ? 'asc' : 'desc'
    };
  }

  private handleError(res: Response, error: any): void {
    console.error('Admin controller error:', error);

    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An internal server error occurred'
        }
      });
    }
  }
}