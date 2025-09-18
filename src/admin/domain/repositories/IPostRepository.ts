import { Post, PostStatus, PostCategory } from '../entities/Post';

export interface PostFilter {
  status?: PostStatus;
  category?: PostCategory;
  authorId?: string;
  tags?: string[];
  search?: string; // Search in title, content, or summary
  featured?: boolean;
  pinned?: boolean;
  allowComments?: boolean;
  relatedContractId?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface PostPagination {
  page: number;
  limit: number;
  sortBy?: 'title' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'viewCount' | 'likeCount';
  sortOrder?: 'asc' | 'desc';
}

export interface PostQueryResult {
  posts: Post[];
  total: number;
  page: number;
  totalPages: number;
}

export interface PostStats {
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
  scheduledPosts: number;
  archivedPosts: number;
  totalViews: number;
  totalLikes: number;
  topCategories: Array<{
    category: PostCategory;
    count: number;
  }>;
  topTags: Array<{
    tag: string;
    count: number;
  }>;
}

export interface IPostRepository {
  /**
   * Find post by ID
   */
  findById(id: string): Promise<Post | null>;

  /**
   * Find post by slug
   */
  findBySlug(slug: string): Promise<Post | null>;

  /**
   * Find posts with filtering and pagination
   */
  findMany(
    filter?: PostFilter,
    pagination?: PostPagination
  ): Promise<PostQueryResult>;

  /**
   * Find published posts (public API)
   */
  findPublished(
    filter?: Omit<PostFilter, 'status'>,
    pagination?: PostPagination
  ): Promise<PostQueryResult>;

  /**
   * Find featured posts
   */
  findFeatured(limit?: number): Promise<Post[]>;

  /**
   * Find pinned posts
   */
  findPinned(): Promise<Post[]>;

  /**
   * Find posts by author
   */
  findByAuthor(
    authorId: string,
    pagination?: PostPagination
  ): Promise<PostQueryResult>;

  /**
   * Find posts by tag
   */
  findByTag(
    tag: string,
    pagination?: PostPagination
  ): Promise<PostQueryResult>;

  /**
   * Find posts by category
   */
  findByCategory(
    category: PostCategory,
    pagination?: PostPagination
  ): Promise<PostQueryResult>;

  /**
   * Find scheduled posts ready for publishing
   */
  findScheduledForPublication(): Promise<Post[]>;

  /**
   * Find related posts
   */
  findRelated(postId: string, limit?: number): Promise<Post[]>;

  /**
   * Find popular posts (by views or likes)
   */
  findPopular(
    timeRange?: 'day' | 'week' | 'month' | 'year',
    limit?: number
  ): Promise<Post[]>;

  /**
   * Search posts
   */
  search(
    query: string,
    filter?: PostFilter,
    pagination?: PostPagination
  ): Promise<PostQueryResult>;

  /**
   * Create a new post
   */
  save(post: Post): Promise<void>;

  /**
   * Update existing post
   */
  update(post: Post): Promise<void>;

  /**
   * Delete post
   */
  delete(id: string): Promise<void>;

  /**
   * Bulk update posts
   */
  bulkUpdate(
    postIds: string[],
    updates: Partial<Pick<Post, 'status' | 'category' | 'pinned' | 'allowComments'>>
  ): Promise<void>;

  /**
   * Bulk delete posts
   */
  bulkDelete(postIds: string[]): Promise<void>;

  /**
   * Increment view count
   */
  incrementViewCount(id: string): Promise<void>;

  /**
   * Increment like count
   */
  incrementLikeCount(id: string): Promise<void>;

  /**
   * Decrement like count
   */
  decrementLikeCount(id: string): Promise<void>;

  /**
   * Get post statistics
   */
  getStats(filter?: PostFilter): Promise<PostStats>;

  /**
   * Get total count of posts
   */
  count(filter?: PostFilter): Promise<number>;

  /**
   * Get all unique tags
   */
  getAllTags(): Promise<string[]>;

  /**
   * Get popular tags
   */
  getPopularTags(limit?: number): Promise<Array<{
    tag: string;
    count: number;
  }>>;

  /**
   * Get posts by date range
   */
  findByDateRange(
    start: Date,
    end: Date,
    status?: PostStatus
  ): Promise<Post[]>;

  /**
   * Check if slug is available
   */
  isSlugAvailable(slug: string, excludeId?: string): Promise<boolean>;

  /**
   * Generate unique slug
   */
  generateUniqueSlug(baseSlug: string, excludeId?: string): Promise<string>;

  /**
   * Archive old posts
   */
  archiveOldPosts(olderThan: Date): Promise<number>;

  /**
   * Export posts for backup
   */
  exportPosts(filter?: PostFilter): Promise<string>; // JSON string

  /**
   * Import posts from backup
   */
  importPosts(postsJson: string): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }>;
}