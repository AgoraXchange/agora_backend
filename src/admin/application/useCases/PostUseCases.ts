import { inject, injectable } from 'inversify';
import {
  IPostRepository,
  PostFilter,
  PostPagination,
  PostQueryResult,
  PostStats
} from '../../domain/repositories/IPostRepository';
import { Post, PostStatus, PostCategory, PostMetadata } from '../../domain/entities/Post';
import { TYPES } from '../../../types';

export interface CreatePostRequest {
  title: string;
  content: string;
  summary: string;
  category: PostCategory;
  authorId: string;
  authorName: string;
  tags?: string[];
  relatedContractId?: string;
  metadata?: Partial<PostMetadata>;
  allowComments?: boolean;
}

export interface UpdatePostRequest {
  id: string;
  title?: string;
  content?: string;
  summary?: string;
  category?: PostCategory;
  tags?: string[];
  metadata?: Partial<PostMetadata>;
  allowComments?: boolean;
  pinned?: boolean;
  modifiedBy: string;
  changeLog?: string;
}

export interface SchedulePostRequest {
  id: string;
  scheduledAt: Date;
}

export interface BulkPostOperation {
  postIds: string[];
  updates: Partial<Pick<Post, 'status' | 'category' | 'pinned' | 'allowComments'>>;
}

@injectable()
export class PostUseCases {
  constructor(
    @inject(TYPES.IPostRepository)
    private postRepository: IPostRepository
  ) {}

  async createPost(request: CreatePostRequest): Promise<Post> {
    const id = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const post = Post.create(
      id,
      request.title,
      request.content,
      request.summary,
      request.category,
      request.authorId,
      request.authorName,
      request.tags
    );

    if (request.relatedContractId) {
      (post as any).relatedContractId = request.relatedContractId;
    }

    if (request.metadata) {
      post.updateMetadata(request.metadata);
    }

    if (request.allowComments !== undefined) {
      (post as any).allowComments = request.allowComments;
    }

    await this.postRepository.save(post);
    return post;
  }

  async getPost(id: string): Promise<Post | null> {
    return this.postRepository.findById(id);
  }

  async getPostBySlug(slug: string): Promise<Post | null> {
    return this.postRepository.findBySlug(slug);
  }

  async updatePost(request: UpdatePostRequest): Promise<Post> {
    const post = await this.postRepository.findById(request.id);
    if (!post) {
      throw new Error(`Post ${request.id} not found`);
    }

    if (request.title || request.content || request.summary) {
      post.updateContent(
        request.title || post.title,
        request.content || post.content,
        request.summary || post.summary,
        request.modifiedBy,
        request.changeLog
      );
    }

    if (request.category) {
      (post as any).category = request.category;
      (post as any).updatedAt = new Date();
    }

    if (request.tags) {
      post.setTags(request.tags);
    }

    if (request.metadata) {
      post.updateMetadata(request.metadata);
    }

    if (request.allowComments !== undefined) {
      if (request.allowComments) {
        (post as any).allowComments = true;
      } else {
        post.toggleComments();
      }
    }

    if (request.pinned !== undefined) {
      if (request.pinned) {
        post.pin();
      } else {
        post.unpin();
      }
    }

    await this.postRepository.update(post);
    return post;
  }

  async deletePost(id: string): Promise<void> {
    const post = await this.postRepository.findById(id);
    if (!post) {
      throw new Error(`Post ${id} not found`);
    }

    if (!post.canDelete()) {
      throw new Error('Post cannot be deleted. It may have been published or has views.');
    }

    await this.postRepository.delete(id);
  }

  async publishPost(id: string): Promise<Post> {
    const post = await this.postRepository.findById(id);
    if (!post) {
      throw new Error(`Post ${id} not found`);
    }

    post.publish();
    await this.postRepository.update(post);
    return post;
  }

  async schedulePost(request: SchedulePostRequest): Promise<Post> {
    const post = await this.postRepository.findById(request.id);
    if (!post) {
      throw new Error(`Post ${request.id} not found`);
    }

    post.schedulePublication(request.scheduledAt);
    await this.postRepository.update(post);
    return post;
  }

  async archivePost(id: string): Promise<Post> {
    const post = await this.postRepository.findById(id);
    if (!post) {
      throw new Error(`Post ${id} not found`);
    }

    post.archive();
    await this.postRepository.update(post);
    return post;
  }

  async getPosts(
    filter?: PostFilter,
    pagination?: PostPagination
  ): Promise<PostQueryResult> {
    return this.postRepository.findMany(filter, pagination);
  }

  async getPublishedPosts(
    filter?: Omit<PostFilter, 'status'>,
    pagination?: PostPagination
  ): Promise<PostQueryResult> {
    return this.postRepository.findPublished(filter, pagination);
  }

  async getFeaturedPosts(limit?: number): Promise<Post[]> {
    return this.postRepository.findFeatured(limit);
  }

  async getPinnedPosts(): Promise<Post[]> {
    return this.postRepository.findPinned();
  }

  async getPostsByAuthor(
    authorId: string,
    pagination?: PostPagination
  ): Promise<PostQueryResult> {
    return this.postRepository.findByAuthor(authorId, pagination);
  }

  async getPostsByTag(
    tag: string,
    pagination?: PostPagination
  ): Promise<PostQueryResult> {
    return this.postRepository.findByTag(tag, pagination);
  }

  async getPostsByCategory(
    category: PostCategory,
    pagination?: PostPagination
  ): Promise<PostQueryResult> {
    return this.postRepository.findByCategory(category, pagination);
  }

  async getScheduledPosts(): Promise<Post[]> {
    return this.postRepository.findScheduledForPublication();
  }

  async publishScheduledPosts(): Promise<{ published: number; errors: string[] }> {
    const scheduledPosts = await this.getScheduledPosts();
    const result = { published: 0, errors: [] as string[] };

    for (const post of scheduledPosts) {
      try {
        post.publish();
        await this.postRepository.update(post);
        result.published++;
      } catch (error) {
        result.errors.push(`Post ${post.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return result;
  }

  async getRelatedPosts(postId: string, limit?: number): Promise<Post[]> {
    return this.postRepository.findRelated(postId, limit);
  }

  async getPopularPosts(
    timeRange?: 'day' | 'week' | 'month' | 'year',
    limit?: number
  ): Promise<Post[]> {
    return this.postRepository.findPopular(timeRange, limit);
  }

  async searchPosts(
    query: string,
    filter?: PostFilter,
    pagination?: PostPagination
  ): Promise<PostQueryResult> {
    return this.postRepository.search(query, filter, pagination);
  }

  async bulkUpdatePosts(operation: BulkPostOperation): Promise<void> {
    await this.postRepository.bulkUpdate(operation.postIds, operation.updates);
  }

  async bulkDeletePosts(postIds: string[]): Promise<void> {
    // Validate that all posts can be deleted
    for (const id of postIds) {
      const post = await this.postRepository.findById(id);
      if (post && !post.canDelete()) {
        throw new Error(`Post ${id} cannot be deleted`);
      }
    }

    await this.postRepository.bulkDelete(postIds);
  }

  async incrementViewCount(id: string): Promise<void> {
    await this.postRepository.incrementViewCount(id);
  }

  async incrementLikeCount(id: string): Promise<void> {
    await this.postRepository.incrementLikeCount(id);
  }

  async decrementLikeCount(id: string): Promise<void> {
    await this.postRepository.decrementLikeCount(id);
  }

  async getPostStats(filter?: PostFilter): Promise<PostStats> {
    return this.postRepository.getStats(filter);
  }

  async getAllTags(): Promise<string[]> {
    return this.postRepository.getAllTags();
  }

  async getPopularTags(limit?: number): Promise<Array<{ tag: string; count: number }>> {
    return this.postRepository.getPopularTags(limit);
  }

  async getPostsByDateRange(
    start: Date,
    end: Date,
    status?: PostStatus
  ): Promise<Post[]> {
    return this.postRepository.findByDateRange(start, end, status);
  }

  async generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
    const baseSlug = title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .trim();

    return this.postRepository.generateUniqueSlug(baseSlug, excludeId);
  }

  async isSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
    return this.postRepository.isSlugAvailable(slug, excludeId);
  }

  async duplicatePost(id: string, title: string, authorId: string, authorName: string): Promise<Post> {
    const original = await this.postRepository.findById(id);
    if (!original) {
      throw new Error(`Post ${id} not found`);
    }

    const newId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const duplicate = new Post(
      newId,
      title,
      original.content,
      original.summary,
      PostStatus.DRAFT,
      original.category,
      authorId,
      authorName,
      new Date(),
      new Date(),
      undefined,
      undefined,
      original.tags,
      original.relatedContractId,
      0, // Reset view count
      0, // Reset like count
      { ...original.metadata }, // Copy metadata
      [], // Fresh revision history
      original.allowComments,
      false // Not pinned by default
    );

    await this.postRepository.save(duplicate);
    return duplicate;
  }

  async revertPostToRevision(id: string, version: number): Promise<Post> {
    const post = await this.postRepository.findById(id);
    if (!post) {
      throw new Error(`Post ${id} not found`);
    }

    post.revertToRevision(version);
    await this.postRepository.update(post);
    return post;
  }

  async archiveOldPosts(olderThan: Date): Promise<number> {
    return this.postRepository.archiveOldPosts(olderThan);
  }

  async exportPosts(filter?: PostFilter): Promise<string> {
    return this.postRepository.exportPosts(filter);
  }

  async importPosts(postsJson: string): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    return this.postRepository.importPosts(postsJson);
  }

  async updatePostMetadata(id: string, metadata: Partial<PostMetadata>): Promise<Post> {
    const post = await this.postRepository.findById(id);
    if (!post) {
      throw new Error(`Post ${id} not found`);
    }

    post.updateMetadata(metadata);
    await this.postRepository.update(post);
    return post;
  }

  async togglePostPin(id: string): Promise<Post> {
    const post = await this.postRepository.findById(id);
    if (!post) {
      throw new Error(`Post ${id} not found`);
    }

    if (post.pinned) {
      post.unpin();
    } else {
      post.pin();
    }

    await this.postRepository.update(post);
    return post;
  }

  async togglePostComments(id: string): Promise<Post> {
    const post = await this.postRepository.findById(id);
    if (!post) {
      throw new Error(`Post ${id} not found`);
    }

    post.toggleComments();
    await this.postRepository.update(post);
    return post;
  }

  async validatePost(id: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const post = await this.postRepository.findById(id);
    if (!post) {
      return {
        isValid: false,
        errors: [`Post ${id} not found`],
        warnings: []
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate content
    if (post.title.length < 5) {
      errors.push('Title is too short (minimum 5 characters)');
    }

    if (post.content.length < 50) {
      warnings.push('Content is very short (less than 50 characters)');
    }

    if (post.summary.length < 10) {
      warnings.push('Summary is very short (less than 10 characters)');
    }

    // Check for missing metadata
    if (post.status === PostStatus.PUBLISHED) {
      if (!post.metadata.seoTitle) {
        warnings.push('SEO title is not set');
      }

      if (!post.metadata.seoDescription) {
        warnings.push('SEO description is not set');
      }

      if (post.tags.length === 0) {
        warnings.push('No tags are set');
      }
    }

    // Check scheduled posts
    if (post.status === PostStatus.SCHEDULED && (!post.scheduledAt || post.scheduledAt <= new Date())) {
      errors.push('Scheduled post must have a future scheduled date');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}