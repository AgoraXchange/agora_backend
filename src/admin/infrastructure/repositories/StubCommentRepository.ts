import { injectable } from 'inversify';
import { Comment, CommentStatus, CommentType, CommentSupportingSide } from '../../domain/entities/Comment';
import { ICommentRepository, CommentFilter, CommentPagination, CommentQueryResult, CommentStats, CommentModerationResult } from '../../domain/repositories/ICommentRepository';

@injectable()
export class StubCommentRepository implements ICommentRepository {
  private throwError(): never {
    throw new Error('Admin features require MongoDB. Set USE_MONGODB=true in .env to enable.');
  }

  async findById(id: string): Promise<Comment | null> {
    this.throwError();
  }

  async findMany(filter?: CommentFilter, pagination?: CommentPagination): Promise<CommentQueryResult> {
    this.throwError();
  }

  async findByParent(parentId: string, parentType: CommentType, includeReplies?: boolean, pagination?: CommentPagination): Promise<CommentQueryResult> {
    this.throwError();
  }

  async findReplies(commentId: string, pagination?: CommentPagination): Promise<CommentQueryResult> {
    this.throwError();
  }

  async findByAuthor(author: string, pagination?: CommentPagination): Promise<CommentQueryResult> {
    this.throwError();
  }

  async findFlagged(unresolvedOnly?: boolean, pagination?: CommentPagination): Promise<CommentQueryResult> {
    this.throwError();
  }

  async findPendingModeration(pagination?: CommentPagination): Promise<CommentQueryResult> {
    this.throwError();
  }

  async findSpam(pagination?: CommentPagination): Promise<CommentQueryResult> {
    this.throwError();
  }

  async findInfluential(parentId?: string, parentType?: CommentType, limit?: number): Promise<Comment[]> {
    this.throwError();
  }

  async search(query: string, filter?: CommentFilter, pagination?: CommentPagination): Promise<CommentQueryResult> {
    this.throwError();
  }

  async save(comment: Comment): Promise<void> {
    this.throwError();
  }

  async update(comment: Comment): Promise<void> {
    this.throwError();
  }

  async delete(id: string): Promise<void> {
    this.throwError();
  }

  async bulkModerate(commentIds: string[], action: 'approve' | 'reject' | 'spam' | 'hide', moderatedBy: string): Promise<CommentModerationResult> {
    this.throwError();
  }

  async bulkDelete(commentIds: string[]): Promise<number> {
    this.throwError();
  }

  async autoModerate(rules: { spamKeywords?: string[]; minVotesForAutoApprove?: number; maxFlagsForAutoReject?: number; }): Promise<CommentModerationResult> {
    this.throwError();
  }

  async getStats(filter?: CommentFilter): Promise<CommentStats> {
    this.throwError();
  }

  async count(filter?: CommentFilter): Promise<number> {
    this.throwError();
  }

  async getCommentTree(parentId: string, parentType: CommentType, maxDepth?: number): Promise<Comment[]> {
    this.throwError();
  }

  async getTopCommenters(timeRange?: 'day' | 'week' | 'month' | 'year', limit?: number): Promise<Array<{ author: string; authorName?: string; commentCount: number; averageScore: number; totalVotes: number; }>> {
    this.throwError();
  }

  async getCommentsNeedingAttention(): Promise<Comment[]> {
    this.throwError();
  }

  async updateVotes(commentId: string, upvotes: number, downvotes: number): Promise<void> {
    this.throwError();
  }

  async archiveOldComments(olderThan: Date): Promise<number> {
    this.throwError();
  }

  async cleanupSpam(olderThan: Date): Promise<number> {
    this.throwError();
  }

  async getModerationHistory(commentId?: string, moderatorId?: string, pagination?: CommentPagination): Promise<Array<{ commentId: string; action: string; moderatedBy: string; moderatedAt: Date; reason?: string; }>> {
    this.throwError();
  }

  async exportComments(filter?: CommentFilter): Promise<string> {
    this.throwError();
  }

  async importComments(commentsJson: string): Promise<{ imported: number; skipped: number; errors: string[]; }> {
    this.throwError();
  }

  async detectSpam(content: string, author: string): Promise<{ isSpam: boolean; confidence: number; reasons: string[]; }> {
    this.throwError();
  }

  async getEngagementMetrics(parentId?: string, parentType?: CommentType, timeRange?: 'day' | 'week' | 'month'): Promise<{ totalComments: number; averageLength: number; responseRate: number; engagementTrend: Array<{ date: Date; commentCount: number; averageVotes: number; }>; }> {
    this.throwError();
  }
}