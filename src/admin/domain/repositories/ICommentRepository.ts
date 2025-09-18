import { Comment, CommentStatus, CommentType, CommentSupportingSide } from '../entities/Comment';

export interface CommentFilter {
  parentId?: string;
  parentType?: CommentType;
  author?: string;
  status?: CommentStatus;
  supportingSide?: CommentSupportingSide;
  isFlagged?: boolean;
  isSpam?: boolean;
  moderatedBy?: string;
  search?: string; // Search in content
  dateRange?: {
    start: Date;
    end: Date;
  };
  votesRange?: {
    min: number;
    max: number;
  };
}

export interface CommentPagination {
  page: number;
  limit: number;
  sortBy?: 'timestamp' | 'netVotes' | 'engagementScore' | 'flagCount';
  sortOrder?: 'asc' | 'desc';
}

export interface CommentQueryResult {
  comments: Comment[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CommentStats {
  totalComments: number;
  pendingComments: number;
  approvedComments: number;
  rejectedComments: number;
  spamComments: number;
  flaggedComments: number;
  totalFlags: number;
  averageEngagementScore: number;
  topContributors: Array<{
    author: string;
    commentCount: number;
    averageScore: number;
  }>;
}

export interface CommentModerationResult {
  processed: number;
  approved: number;
  rejected: number;
  errors: string[];
}

export interface ICommentRepository {
  /**
   * Find comment by ID
   */
  findById(id: string): Promise<Comment | null>;

  /**
   * Find comments with filtering and pagination
   */
  findMany(
    filter?: CommentFilter,
    pagination?: CommentPagination
  ): Promise<CommentQueryResult>;

  /**
   * Find comments by parent (contract, post, etc.)
   */
  findByParent(
    parentId: string,
    parentType: CommentType,
    includeReplies?: boolean,
    pagination?: CommentPagination
  ): Promise<CommentQueryResult>;

  /**
   * Find replies to a comment
   */
  findReplies(
    commentId: string,
    pagination?: CommentPagination
  ): Promise<CommentQueryResult>;

  /**
   * Find comments by author
   */
  findByAuthor(
    author: string,
    pagination?: CommentPagination
  ): Promise<CommentQueryResult>;

  /**
   * Find flagged comments
   */
  findFlagged(
    unresolvedOnly?: boolean,
    pagination?: CommentPagination
  ): Promise<CommentQueryResult>;

  /**
   * Find comments pending moderation
   */
  findPendingModeration(
    pagination?: CommentPagination
  ): Promise<CommentQueryResult>;

  /**
   * Find spam comments
   */
  findSpam(
    pagination?: CommentPagination
  ): Promise<CommentQueryResult>;

  /**
   * Find influential comments (high engagement)
   */
  findInfluential(
    parentId?: string,
    parentType?: CommentType,
    limit?: number
  ): Promise<Comment[]>;

  /**
   * Search comments
   */
  search(
    query: string,
    filter?: CommentFilter,
    pagination?: CommentPagination
  ): Promise<CommentQueryResult>;

  /**
   * Create a new comment
   */
  save(comment: Comment): Promise<void>;

  /**
   * Update existing comment
   */
  update(comment: Comment): Promise<void>;

  /**
   * Delete comment
   */
  delete(id: string): Promise<void>;

  /**
   * Bulk moderation operations
   */
  bulkModerate(
    commentIds: string[],
    action: 'approve' | 'reject' | 'spam' | 'hide',
    moderatedBy: string
  ): Promise<CommentModerationResult>;

  /**
   * Bulk delete comments
   */
  bulkDelete(commentIds: string[]): Promise<number>;

  /**
   * Auto-moderate comments based on rules
   */
  autoModerate(rules: {
    spamKeywords?: string[];
    minVotesForAutoApprove?: number;
    maxFlagsForAutoReject?: number;
  }): Promise<CommentModerationResult>;

  /**
   * Get comment statistics
   */
  getStats(filter?: CommentFilter): Promise<CommentStats>;

  /**
   * Get total count of comments
   */
  count(filter?: CommentFilter): Promise<number>;

  /**
   * Get comment tree (with nested replies)
   */
  getCommentTree(
    parentId: string,
    parentType: CommentType,
    maxDepth?: number
  ): Promise<Comment[]>;

  /**
   * Get most active commenters
   */
  getTopCommenters(
    timeRange?: 'day' | 'week' | 'month' | 'year',
    limit?: number
  ): Promise<Array<{
    author: string;
    authorName?: string;
    commentCount: number;
    averageScore: number;
    totalVotes: number;
  }>>;

  /**
   * Get comments that need attention (flagged, spam detected, etc.)
   */
  getCommentsNeedingAttention(): Promise<Comment[]>;

  /**
   * Update vote counts
   */
  updateVotes(commentId: string, upvotes: number, downvotes: number): Promise<void>;

  /**
   * Archive old comments
   */
  archiveOldComments(olderThan: Date): Promise<number>;

  /**
   * Clean up spam comments
   */
  cleanupSpam(olderThan: Date): Promise<number>;

  /**
   * Get comment moderation history
   */
  getModerationHistory(
    commentId?: string,
    moderatorId?: string,
    pagination?: CommentPagination
  ): Promise<Array<{
    commentId: string;
    action: string;
    moderatedBy: string;
    moderatedAt: Date;
    reason?: string;
  }>>;

  /**
   * Export comments for backup
   */
  exportComments(filter?: CommentFilter): Promise<string>; // JSON string

  /**
   * Import comments from backup
   */
  importComments(commentsJson: string): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }>;

  /**
   * Detect potential spam using patterns
   */
  detectSpam(content: string, author: string): Promise<{
    isSpam: boolean;
    confidence: number;
    reasons: string[];
  }>;

  /**
   * Get engagement metrics
   */
  getEngagementMetrics(
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
  }>;
}