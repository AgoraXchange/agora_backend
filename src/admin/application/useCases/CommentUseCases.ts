import { inject, injectable } from 'inversify';
import {
  ICommentRepository,
  CommentFilter,
  CommentPagination,
  CommentQueryResult,
  CommentStats,
  CommentModerationResult
} from '../../domain/repositories/ICommentRepository';
import { Comment, CommentStatus, CommentType, CommentSupportingSide } from '../../domain/entities/Comment';
import { TYPES } from '../../../types';

export interface CreateCommentRequest {
  parentId: string;
  parentType: CommentType;
  author: string;
  authorName?: string;
  content: string;
  supportingSide?: CommentSupportingSide;
  replyTo?: string;
}

export interface UpdateCommentRequest {
  id: string;
  content?: string;
  supportingSide?: CommentSupportingSide;
  editedBy: string;
  reason?: string;
}

export interface ModerateCommentRequest {
  id: string;
  action: 'approve' | 'reject' | 'spam' | 'hide' | 'restore';
  moderatedBy: string;
  reason?: string;
}

export interface BulkModerationRequest {
  commentIds: string[];
  action: 'approve' | 'reject' | 'spam' | 'hide';
  moderatedBy: string;
}

export interface FlagCommentRequest {
  id: string;
  flaggedBy: string;
  reason: string;
  description?: string;
}

export interface ResolveFlagRequest {
  commentId: string;
  flagId: string;
  resolvedBy: string;
  action?: 'dismissed' | 'warning' | 'removed' | 'banned';
}

export interface AddAdminNoteRequest {
  commentId: string;
  note: string;
  addedBy: string;
  isInternal?: boolean;
}

export interface AutoModerationRules {
  spamKeywords?: string[];
  minVotesForAutoApprove?: number;
  maxFlagsForAutoReject?: number;
}

@injectable()
export class CommentUseCases {
  constructor(
    @inject(TYPES.ICommentRepository)
    private commentRepository: ICommentRepository
  ) {}

  async createComment(request: CreateCommentRequest): Promise<Comment> {
    const id = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check if parent exists and reply-to is valid
    if (request.replyTo) {
      const parentComment = await this.commentRepository.findById(request.replyTo);
      if (!parentComment) {
        throw new Error(`Parent comment ${request.replyTo} not found`);
      }
      if (parentComment.parentId !== request.parentId) {
        throw new Error('Reply must be to a comment in the same parent context');
      }
    }

    // Run spam detection
    const spamDetection = await this.commentRepository.detectSpam(request.content, request.author);

    const comment = Comment.create(
      id,
      request.parentId,
      request.parentType,
      request.author,
      request.content,
      request.authorName,
      request.replyTo
    );

    if (request.supportingSide) {
      comment.setSupportingSide(request.supportingSide);
    }

    // Auto-mark as spam if detected
    if (spamDetection.isSpam && spamDetection.confidence > 0.8) {
      comment.markAsSpam('system');
    }

    await this.commentRepository.save(comment);
    return comment;
  }

  async getComment(id: string): Promise<Comment | null> {
    return this.commentRepository.findById(id);
  }

  async updateComment(request: UpdateCommentRequest): Promise<Comment> {
    const comment = await this.commentRepository.findById(request.id);
    if (!comment) {
      throw new Error(`Comment ${request.id} not found`);
    }

    if (request.content) {
      comment.editContent(request.content, request.editedBy, request.reason);
    }

    if (request.supportingSide) {
      comment.setSupportingSide(request.supportingSide);
    }

    await this.commentRepository.update(comment);
    return comment;
  }

  async deleteComment(id: string): Promise<void> {
    const comment = await this.commentRepository.findById(id);
    if (!comment) {
      throw new Error(`Comment ${id} not found`);
    }

    if (!comment.canDelete()) {
      throw new Error('Comment cannot be deleted due to existing votes or interactions');
    }

    await this.commentRepository.delete(id);
  }

  async moderateComment(request: ModerateCommentRequest): Promise<Comment> {
    const comment = await this.commentRepository.findById(request.id);
    if (!comment) {
      throw new Error(`Comment ${request.id} not found`);
    }

    switch (request.action) {
      case 'approve':
        comment.approve(request.moderatedBy);
        break;
      case 'reject':
        comment.reject(request.moderatedBy);
        break;
      case 'spam':
        comment.markAsSpam(request.moderatedBy);
        break;
      case 'hide':
        comment.hide(request.moderatedBy);
        break;
      case 'restore':
        comment.restore(request.moderatedBy);
        break;
      default:
        throw new Error(`Unknown moderation action: ${request.action}`);
    }

    // Add admin note if reason provided
    if (request.reason) {
      comment.addAdminNote(`Moderation: ${request.action} - ${request.reason}`, request.moderatedBy, true);
    }

    await this.commentRepository.update(comment);
    return comment;
  }

  async bulkModerate(request: BulkModerationRequest): Promise<CommentModerationResult> {
    return this.commentRepository.bulkModerate(request.commentIds, request.action, request.moderatedBy);
  }

  async getComments(
    filter?: CommentFilter,
    pagination?: CommentPagination
  ): Promise<CommentQueryResult> {
    return this.commentRepository.findMany(filter, pagination);
  }

  async getCommentsByParent(
    parentId: string,
    parentType: CommentType,
    includeReplies?: boolean,
    pagination?: CommentPagination
  ): Promise<CommentQueryResult> {
    return this.commentRepository.findByParent(parentId, parentType, includeReplies, pagination);
  }

  async getCommentReplies(
    commentId: string,
    pagination?: CommentPagination
  ): Promise<CommentQueryResult> {
    return this.commentRepository.findReplies(commentId, pagination);
  }

  async getCommentsByAuthor(
    author: string,
    pagination?: CommentPagination
  ): Promise<CommentQueryResult> {
    return this.commentRepository.findByAuthor(author, pagination);
  }

  async getFlaggedComments(
    unresolvedOnly?: boolean,
    pagination?: CommentPagination
  ): Promise<CommentQueryResult> {
    return this.commentRepository.findFlagged(unresolvedOnly, pagination);
  }

  async getPendingComments(
    pagination?: CommentPagination
  ): Promise<CommentQueryResult> {
    return this.commentRepository.findPendingModeration(pagination);
  }

  async getSpamComments(
    pagination?: CommentPagination
  ): Promise<CommentQueryResult> {
    return this.commentRepository.findSpam(pagination);
  }

  async getInfluentialComments(
    parentId?: string,
    parentType?: CommentType,
    limit?: number
  ): Promise<Comment[]> {
    return this.commentRepository.findInfluential(parentId, parentType, limit);
  }

  async searchComments(
    query: string,
    filter?: CommentFilter,
    pagination?: CommentPagination
  ): Promise<CommentQueryResult> {
    return this.commentRepository.search(query, filter, pagination);
  }

  async flagComment(request: FlagCommentRequest): Promise<string> {
    const comment = await this.commentRepository.findById(request.id);
    if (!comment) {
      throw new Error(`Comment ${request.id} not found`);
    }

    const flagId = comment.addFlag(request.flaggedBy, request.reason, request.description);
    await this.commentRepository.update(comment);
    return flagId;
  }

  async resolveFlag(request: ResolveFlagRequest): Promise<Comment> {
    const comment = await this.commentRepository.findById(request.commentId);
    if (!comment) {
      throw new Error(`Comment ${request.commentId} not found`);
    }

    comment.resolveFlag(request.flagId, request.resolvedBy, request.action);
    await this.commentRepository.update(comment);
    return comment;
  }

  async resolveAllFlags(
    commentId: string,
    resolvedBy: string,
    action?: 'dismissed' | 'warning' | 'removed' | 'banned'
  ): Promise<Comment> {
    const comment = await this.commentRepository.findById(commentId);
    if (!comment) {
      throw new Error(`Comment ${commentId} not found`);
    }

    comment.resolveAllFlags(resolvedBy, action);
    await this.commentRepository.update(comment);
    return comment;
  }

  async addAdminNote(request: AddAdminNoteRequest): Promise<string> {
    const comment = await this.commentRepository.findById(request.commentId);
    if (!comment) {
      throw new Error(`Comment ${request.commentId} not found`);
    }

    const noteId = comment.addAdminNote(request.note, request.addedBy, request.isInternal);
    await this.commentRepository.update(comment);
    return noteId;
  }

  async removeAdminNote(commentId: string, noteId: string): Promise<Comment> {
    const comment = await this.commentRepository.findById(commentId);
    if (!comment) {
      throw new Error(`Comment ${commentId} not found`);
    }

    comment.removeAdminNote(noteId);
    await this.commentRepository.update(comment);
    return comment;
  }

  async voteOnComment(commentId: string, voteType: 'up' | 'down' | 'remove_up' | 'remove_down'): Promise<Comment> {
    const comment = await this.commentRepository.findById(commentId);
    if (!comment) {
      throw new Error(`Comment ${commentId} not found`);
    }

    switch (voteType) {
      case 'up':
        comment.upvote();
        break;
      case 'down':
        comment.downvote();
        break;
      case 'remove_up':
        comment.removeUpvote();
        break;
      case 'remove_down':
        comment.removeDownvote();
        break;
      default:
        throw new Error(`Invalid vote type: ${voteType}`);
    }

    await this.commentRepository.update(comment);
    return comment;
  }

  async updateVotes(commentId: string, upvotes: number, downvotes: number): Promise<void> {
    await this.commentRepository.updateVotes(commentId, upvotes, downvotes);
  }

  async autoModerate(rules: AutoModerationRules): Promise<CommentModerationResult> {
    return this.commentRepository.autoModerate(rules);
  }

  async getCommentStats(filter?: CommentFilter): Promise<CommentStats> {
    return this.commentRepository.getStats(filter);
  }

  async getCommentTree(
    parentId: string,
    parentType: CommentType,
    maxDepth?: number
  ): Promise<Comment[]> {
    return this.commentRepository.getCommentTree(parentId, parentType, maxDepth);
  }

  async getTopCommenters(
    timeRange?: 'day' | 'week' | 'month' | 'year',
    limit?: number
  ): Promise<Array<{
    author: string;
    authorName?: string;
    commentCount: number;
    averageScore: number;
    totalVotes: number;
  }>> {
    return this.commentRepository.getTopCommenters(timeRange, limit);
  }

  async getCommentsNeedingAttention(): Promise<Comment[]> {
    return this.commentRepository.getCommentsNeedingAttention();
  }

  async revertCommentToVersion(commentId: string, version: number): Promise<Comment> {
    const comment = await this.commentRepository.findById(commentId);
    if (!comment) {
      throw new Error(`Comment ${commentId} not found`);
    }

    comment.revertToVersion(version);
    await this.commentRepository.update(comment);
    return comment;
  }

  async bulkDeleteComments(commentIds: string[]): Promise<number> {
    // Validate that all comments can be deleted
    for (const id of commentIds) {
      const comment = await this.commentRepository.findById(id);
      if (comment && !comment.canDelete()) {
        throw new Error(`Comment ${id} cannot be deleted due to existing interactions`);
      }
    }

    return this.commentRepository.bulkDelete(commentIds);
  }

  async archiveOldComments(olderThan: Date): Promise<number> {
    return this.commentRepository.archiveOldComments(olderThan);
  }

  async cleanupSpamComments(olderThan: Date): Promise<number> {
    return this.commentRepository.cleanupSpam(olderThan);
  }

  async getModerationHistory(
    commentId?: string,
    moderatorId?: string,
    pagination?: CommentPagination
  ): Promise<Array<{
    commentId: string;
    action: string;
    moderatedBy: string;
    moderatedAt: Date;
    reason?: string;
  }>> {
    return this.commentRepository.getModerationHistory(commentId, moderatorId, pagination);
  }

  async exportComments(filter?: CommentFilter): Promise<string> {
    return this.commentRepository.exportComments(filter);
  }

  async importComments(commentsJson: string): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    return this.commentRepository.importComments(commentsJson);
  }

  async detectSpam(content: string, author: string): Promise<{
    isSpam: boolean;
    confidence: number;
    reasons: string[];
  }> {
    return this.commentRepository.detectSpam(content, author);
  }

  async getEngagementMetrics(
    parentId?: string,
    parentType?: CommentType,
    timeRange?: 'day' | 'week' | 'month'
  ): Promise<{
    totalComments: number;
    averageLength: number;
    responseRate: number;
    engagementTrend: Array<{
      date: Date;
      commentCount: number;
      averageVotes: number;
    }>;
  }> {
    return this.commentRepository.getEngagementMetrics(parentId, parentType, timeRange);
  }

  async validateComment(id: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const comment = await this.commentRepository.findById(id);
    if (!comment) {
      return {
        isValid: false,
        errors: [`Comment ${id} not found`],
        warnings: []
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate content
    if (comment.content.length < 1) {
      errors.push('Comment content is empty');
    }

    if (comment.content.length > 2000) {
      errors.push('Comment content exceeds maximum length');
    }

    // Check for potential spam
    const spamDetection = await this.detectSpam(comment.content, comment.author);
    if (spamDetection.isSpam && spamDetection.confidence > 0.6) {
      warnings.push(`Potential spam detected (${Math.round(spamDetection.confidence * 100)}% confidence)`);
    }

    // Check flagged status
    if (comment.isFlagged && comment.status === CommentStatus.APPROVED) {
      warnings.push('Comment is approved but has unresolved flags');
    }

    // Check moderation consistency
    if (comment.isSpam && comment.status !== CommentStatus.SPAM) {
      warnings.push('Comment is marked as spam but status is not SPAM');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  async getCommentAnalytics(
    parentId?: string,
    parentType?: CommentType,
    timeRange?: 'day' | 'week' | 'month' | 'year'
  ): Promise<{
    totalComments: number;
    sentimentBreakdown: {
      positive: number;
      negative: number;
      neutral: number;
    };
    topicDistribution: Array<{
      supportingSide: CommentSupportingSide;
      count: number;
      percentage: number;
    }>;
    moderationMetrics: {
      pendingCount: number;
      approvedCount: number;
      rejectedCount: number;
      spamCount: number;
    };
  }> {
    const filter: CommentFilter = {};
    if (parentId) filter.parentId = parentId;
    if (parentType) filter.parentType = parentType;

    if (timeRange) {
      const now = new Date();
      const pastDate = new Date();
      switch (timeRange) {
        case 'day':
          pastDate.setDate(now.getDate() - 1);
          break;
        case 'week':
          pastDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          pastDate.setMonth(now.getMonth() - 1);
          break;
        case 'year':
          pastDate.setFullYear(now.getFullYear() - 1);
          break;
      }
      filter.dateRange = { start: pastDate, end: now };
    }

    const stats = await this.commentRepository.getStats(filter);
    const allComments = await this.commentRepository.findMany(filter, { page: 1, limit: 1000 });

    // Calculate sentiment (simplified - based on vote ratios)
    let positive = 0, negative = 0, neutral = 0;
    const topicCounts = new Map<CommentSupportingSide, number>();

    for (const comment of allComments.comments) {
      const netVotes = comment.netVotes;
      if (netVotes > 2) positive++;
      else if (netVotes < -2) negative++;
      else neutral++;

      const side = comment.supportingSide || CommentSupportingSide.UNKNOWN;
      topicCounts.set(side, (topicCounts.get(side) || 0) + 1);
    }

    const topicDistribution = Array.from(topicCounts.entries()).map(([side, count]) => ({
      supportingSide: side,
      count,
      percentage: allComments.total > 0 ? (count / allComments.total) * 100 : 0
    }));

    return {
      totalComments: stats.totalComments,
      sentimentBreakdown: {
        positive,
        negative,
        neutral
      },
      topicDistribution,
      moderationMetrics: {
        pendingCount: stats.pendingComments,
        approvedCount: stats.approvedComments,
        rejectedCount: stats.rejectedComments,
        spamCount: stats.spamComments
      }
    };
  }
}