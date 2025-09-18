import { injectable } from 'inversify';
import { Post, PostStatus, PostCategory } from '../../domain/entities/Post';
import { IPostRepository, PostFilter, PostPagination, PostQueryResult, PostStats } from '../../domain/repositories/IPostRepository';

@injectable()
export class StubPostRepository implements IPostRepository {
  private throwError(): never {
    throw new Error('Admin features require MongoDB. Set USE_MONGODB=true in .env to enable.');
  }

  async findById(id: string): Promise<Post | null> {
    this.throwError();
  }

  async findBySlug(slug: string): Promise<Post | null> {
    this.throwError();
  }

  async findMany(filter?: PostFilter, pagination?: PostPagination): Promise<PostQueryResult> {
    this.throwError();
  }

  async findPublished(filter?: Omit<PostFilter, 'status'>, pagination?: PostPagination): Promise<PostQueryResult> {
    this.throwError();
  }

  async findFeatured(limit?: number): Promise<Post[]> {
    this.throwError();
  }

  async findPinned(): Promise<Post[]> {
    this.throwError();
  }

  async findByAuthor(authorId: string, pagination?: PostPagination): Promise<PostQueryResult> {
    this.throwError();
  }

  async findByTag(tag: string, pagination?: PostPagination): Promise<PostQueryResult> {
    this.throwError();
  }

  async findByCategory(category: PostCategory, pagination?: PostPagination): Promise<PostQueryResult> {
    this.throwError();
  }

  async findScheduledForPublication(): Promise<Post[]> {
    this.throwError();
  }

  async findRelated(postId: string, limit?: number): Promise<Post[]> {
    this.throwError();
  }

  async findPopular(timeRange?: 'day' | 'week' | 'month' | 'year', limit?: number): Promise<Post[]> {
    this.throwError();
  }

  async search(query: string, filter?: PostFilter, pagination?: PostPagination): Promise<PostQueryResult> {
    this.throwError();
  }

  async save(post: Post): Promise<void> {
    this.throwError();
  }

  async update(post: Post): Promise<void> {
    this.throwError();
  }

  async delete(id: string): Promise<void> {
    this.throwError();
  }

  async bulkUpdate(postIds: string[], updates: Partial<Pick<Post, 'status' | 'category' | 'pinned' | 'allowComments'>>): Promise<void> {
    this.throwError();
  }

  async bulkDelete(postIds: string[]): Promise<void> {
    this.throwError();
  }

  async incrementViewCount(id: string): Promise<void> {
    this.throwError();
  }

  async incrementLikeCount(id: string): Promise<void> {
    this.throwError();
  }

  async decrementLikeCount(id: string): Promise<void> {
    this.throwError();
  }

  async getStats(filter?: PostFilter): Promise<PostStats> {
    this.throwError();
  }

  async count(filter?: PostFilter): Promise<number> {
    this.throwError();
  }

  async getAllTags(): Promise<string[]> {
    this.throwError();
  }

  async getPopularTags(limit?: number): Promise<Array<{ tag: string; count: number; }>> {
    this.throwError();
  }

  async findByDateRange(start: Date, end: Date, status?: PostStatus): Promise<Post[]> {
    this.throwError();
  }

  async isSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
    this.throwError();
  }

  async generateUniqueSlug(baseSlug: string, excludeId?: string): Promise<string> {
    this.throwError();
  }

  async archiveOldPosts(olderThan: Date): Promise<number> {
    this.throwError();
  }

  async exportPosts(filter?: PostFilter): Promise<string> {
    this.throwError();
  }

  async importPosts(postsJson: string): Promise<{ imported: number; skipped: number; errors: string[]; }> {
    this.throwError();
  }
}