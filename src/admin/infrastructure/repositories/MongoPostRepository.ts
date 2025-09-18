import { inject, injectable } from 'inversify';
import { Collection, Db, ObjectId } from 'mongodb';
import {
  IPostRepository,
  PostFilter,
  PostPagination,
  PostQueryResult,
  PostStats
} from '../../domain/repositories/IPostRepository';
import { Post, PostStatus, PostCategory, PostMetadata, PostRevision } from '../../domain/entities/Post';
import { TYPES } from '../../../types';

interface PostDocument {
  _id?: ObjectId;
  id: string;
  title: string;
  content: string;
  summary: string;
  status: PostStatus;
  category: PostCategory;
  authorId: string;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  scheduledAt?: Date;
  tags: string[];
  relatedContractId?: string;
  viewCount: number;
  likeCount: number;
  metadata: PostMetadata;
  revisions: PostRevision[];
  allowComments: boolean;
  pinned: boolean;
}

@injectable()
export class MongoPostRepository implements IPostRepository {
  private collection: Collection<PostDocument>;

  constructor(@inject(TYPES.MongoClient) db: Db) {
    this.collection = db.collection<PostDocument>('posts');
    this.ensureIndexes();
  }

  private async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ id: 1 }, { unique: true });
    await this.collection.createIndex({ status: 1 });
    await this.collection.createIndex({ category: 1 });
    await this.collection.createIndex({ authorId: 1 });
    await this.collection.createIndex({ tags: 1 });
    await this.collection.createIndex({ publishedAt: -1 });
    await this.collection.createIndex({ viewCount: -1 });
    await this.collection.createIndex({ likeCount: -1 });
    await this.collection.createIndex({ pinned: -1, publishedAt: -1 });
    await this.collection.createIndex({ title: 'text', content: 'text', summary: 'text' });
    await this.collection.createIndex({ scheduledAt: 1 });
    await this.collection.createIndex({ 'metadata.slug': 1 });
  }

  async findById(id: string): Promise<Post | null> {
    const doc = await this.collection.findOne({ id });
    return doc ? this.mapToEntity(doc) : null;
  }

  async findBySlug(slug: string): Promise<Post | null> {
    const doc = await this.collection.findOne({ 'metadata.slug': slug });
    return doc ? this.mapToEntity(doc) : null;
  }

  async findMany(
    filter?: PostFilter,
    pagination?: PostPagination
  ): Promise<PostQueryResult> {
    const query = this.buildQuery(filter);
    const skip = pagination ? (pagination.page - 1) * pagination.limit : 0;
    const limit = pagination?.limit || 20;

    const sortOptions = this.buildSortOptions(pagination);

    const [posts, total] = await Promise.all([
      this.collection.find(query).sort(sortOptions).skip(skip).limit(limit).toArray(),
      this.collection.countDocuments(query)
    ]);

    return {
      posts: posts.map(doc => this.mapToEntity(doc)),
      total,
      page: pagination?.page || 1,
      totalPages: Math.ceil(total / limit)
    };
  }

  async findPublished(
    filter?: Omit<PostFilter, 'status'>,
    pagination?: PostPagination
  ): Promise<PostQueryResult> {
    const publishedFilter = { ...filter, status: PostStatus.PUBLISHED };
    const query = this.buildQuery(publishedFilter);
    query.publishedAt = { $lte: new Date() };

    const skip = pagination ? (pagination.page - 1) * pagination.limit : 0;
    const limit = pagination?.limit || 20;

    const sortOptions = this.buildSortOptions(pagination) || { publishedAt: -1 };

    const [posts, total] = await Promise.all([
      this.collection.find(query).sort(sortOptions).skip(skip).limit(limit).toArray(),
      this.collection.countDocuments(query)
    ]);

    return {
      posts: posts.map(doc => this.mapToEntity(doc)),
      total,
      page: pagination?.page || 1,
      totalPages: Math.ceil(total / limit)
    };
  }

  async findFeatured(limit?: number): Promise<Post[]> {
    const query = {
      status: PostStatus.PUBLISHED,
      'metadata.featured': true,
      publishedAt: { $lte: new Date() }
    };

    const docs = await this.collection
      .find(query)
      .sort({ publishedAt: -1 })
      .limit(limit || 10)
      .toArray();

    return docs.map(doc => this.mapToEntity(doc));
  }

  async findPinned(): Promise<Post[]> {
    const query = {
      status: PostStatus.PUBLISHED,
      pinned: true,
      publishedAt: { $lte: new Date() }
    };

    const docs = await this.collection
      .find(query)
      .sort({ publishedAt: -1 })
      .toArray();

    return docs.map(doc => this.mapToEntity(doc));
  }

  async findByAuthor(
    authorId: string,
    pagination?: PostPagination
  ): Promise<PostQueryResult> {
    return this.findMany({ authorId }, pagination);
  }

  async findByTag(
    tag: string,
    pagination?: PostPagination
  ): Promise<PostQueryResult> {
    return this.findMany({ tags: [tag] }, pagination);
  }

  async findByCategory(
    category: PostCategory,
    pagination?: PostPagination
  ): Promise<PostQueryResult> {
    return this.findMany({ category }, pagination);
  }

  async findScheduledForPublication(): Promise<Post[]> {
    const query = {
      status: PostStatus.SCHEDULED,
      scheduledAt: { $lte: new Date() }
    };

    const docs = await this.collection.find(query).toArray();
    return docs.map(doc => this.mapToEntity(doc));
  }

  async findRelated(postId: string, limit?: number): Promise<Post[]> {
    const post = await this.findById(postId);
    if (!post) return [];

    const query = {
      id: { $ne: postId },
      status: PostStatus.PUBLISHED,
      publishedAt: { $lte: new Date() },
      $or: [
        { category: post.category },
        { tags: { $in: post.tags } },
        { relatedContractId: post.relatedContractId }
      ]
    };

    const docs = await this.collection
      .find(query)
      .sort({ publishedAt: -1 })
      .limit(limit || 5)
      .toArray();

    return docs.map(doc => this.mapToEntity(doc));
  }

  async findPopular(
    timeRange?: 'day' | 'week' | 'month' | 'year',
    limit?: number
  ): Promise<Post[]> {
    let dateFilter = {};
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
      dateFilter = { publishedAt: { $gte: pastDate, $lte: now } };
    }

    const query = {
      status: PostStatus.PUBLISHED,
      publishedAt: { $lte: new Date() },
      ...dateFilter
    };

    const docs = await this.collection
      .find(query)
      .sort({ viewCount: -1, likeCount: -1 })
      .limit(limit || 10)
      .toArray();

    return docs.map(doc => this.mapToEntity(doc));
  }

  async search(
    query: string,
    filter?: PostFilter,
    pagination?: PostPagination
  ): Promise<PostQueryResult> {
    const searchFilter = { ...filter, search: query };
    return this.findMany(searchFilter, pagination);
  }

  async save(post: Post): Promise<void> {
    const doc = this.mapToDocument(post);
    await this.collection.replaceOne({ id: post.id }, doc, { upsert: true });
  }

  async update(post: Post): Promise<void> {
    const doc = this.mapToDocument(post);
    await this.collection.replaceOne({ id: post.id }, doc);
  }

  async delete(id: string): Promise<void> {
    await this.collection.deleteOne({ id });
  }

  async bulkUpdate(
    postIds: string[],
    updates: Partial<Pick<Post, 'status' | 'category' | 'pinned' | 'allowComments'>>
  ): Promise<void> {
    const updateDoc: any = { updatedAt: new Date() };
    if (updates.status !== undefined) updateDoc.status = updates.status;
    if (updates.category !== undefined) updateDoc.category = updates.category;
    if (updates.pinned !== undefined) updateDoc.pinned = updates.pinned;
    if (updates.allowComments !== undefined) updateDoc.allowComments = updates.allowComments;

    await this.collection.updateMany(
      { id: { $in: postIds } },
      { $set: updateDoc }
    );
  }

  async bulkDelete(postIds: string[]): Promise<void> {
    await this.collection.deleteMany({ id: { $in: postIds } });
  }

  async incrementViewCount(id: string): Promise<void> {
    await this.collection.updateOne(
      { id },
      { $inc: { viewCount: 1 } }
    );
  }

  async incrementLikeCount(id: string): Promise<void> {
    await this.collection.updateOne(
      { id },
      { $inc: { likeCount: 1 } }
    );
  }

  async decrementLikeCount(id: string): Promise<void> {
    await this.collection.updateOne(
      { id, likeCount: { $gt: 0 } },
      { $inc: { likeCount: -1 } }
    );
  }

  async getStats(filter?: PostFilter): Promise<PostStats> {
    const query = this.buildQuery(filter);

    const [
      totalPosts,
      publishedPosts,
      draftPosts,
      scheduledPosts,
      archivedPosts,
      aggregateStats
    ] = await Promise.all([
      this.collection.countDocuments(query),
      this.collection.countDocuments({ ...query, status: PostStatus.PUBLISHED }),
      this.collection.countDocuments({ ...query, status: PostStatus.DRAFT }),
      this.collection.countDocuments({ ...query, status: PostStatus.SCHEDULED }),
      this.collection.countDocuments({ ...query, status: PostStatus.ARCHIVED }),
      this.collection.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalViews: { $sum: '$viewCount' },
            totalLikes: { $sum: '$likeCount' }
          }
        }
      ]).toArray()
    ]);

    const stats = aggregateStats[0] || { totalViews: 0, totalLikes: 0 };

    // Get top categories
    const categoryStats = await this.collection.aggregate([
      { $match: query },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]).toArray();

    // Get top tags
    const tagStats = await this.collection.aggregate([
      { $match: query },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]).toArray();

    return {
      totalPosts,
      publishedPosts,
      draftPosts,
      scheduledPosts,
      archivedPosts,
      totalViews: stats.totalViews,
      totalLikes: stats.totalLikes,
      topCategories: categoryStats.map(stat => ({
        category: stat._id,
        count: stat.count
      })),
      topTags: tagStats.map(stat => ({
        tag: stat._id,
        count: stat.count
      }))
    };
  }

  async count(filter?: PostFilter): Promise<number> {
    const query = this.buildQuery(filter);
    return this.collection.countDocuments(query);
  }

  async getAllTags(): Promise<string[]> {
    const tags = await this.collection.distinct('tags');
    return tags.sort();
  }

  async getPopularTags(limit?: number): Promise<Array<{ tag: string; count: number }>> {
    const tagStats = await this.collection.aggregate([
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit || 50 }
    ]).toArray();

    return tagStats.map(stat => ({
      tag: stat._id,
      count: stat.count
    }));
  }

  async findByDateRange(
    start: Date,
    end: Date,
    status?: PostStatus
  ): Promise<Post[]> {
    const query: any = {
      publishedAt: { $gte: start, $lte: end }
    };

    if (status) {
      query.status = status;
    }

    const docs = await this.collection
      .find(query)
      .sort({ publishedAt: -1 })
      .toArray();

    return docs.map(doc => this.mapToEntity(doc));
  }

  async isSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
    const query: any = { 'metadata.slug': slug };
    if (excludeId) {
      query.id = { $ne: excludeId };
    }

    const count = await this.collection.countDocuments(query);
    return count === 0;
  }

  async generateUniqueSlug(baseSlug: string, excludeId?: string): Promise<string> {
    let slug = baseSlug;
    let counter = 1;

    while (!(await this.isSlugAvailable(slug, excludeId))) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  async archiveOldPosts(olderThan: Date): Promise<number> {
    const result = await this.collection.updateMany(
      {
        status: { $ne: PostStatus.ARCHIVED },
        publishedAt: { $lt: olderThan }
      },
      {
        $set: {
          status: PostStatus.ARCHIVED,
          updatedAt: new Date()
        }
      }
    );

    return result.modifiedCount;
  }

  async exportPosts(filter?: PostFilter): Promise<string> {
    const query = this.buildQuery(filter);
    const docs = await this.collection.find(query).toArray();
    const posts = docs.map(doc => this.mapToEntity(doc));
    return JSON.stringify(posts, null, 2);
  }

  async importPosts(postsJson: string): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    const result = { imported: 0, skipped: 0, errors: [] as string[] };

    try {
      const posts = JSON.parse(postsJson) as Post[];

      for (const postData of posts) {
        try {
          const existing = await this.findById(postData.id);
          if (existing) {
            result.skipped++;
            continue;
          }

          const post = new Post(
            postData.id,
            postData.title,
            postData.content,
            postData.summary,
            postData.status,
            postData.category,
            postData.authorId,
            postData.authorName,
            postData.createdAt,
            postData.updatedAt,
            postData.publishedAt,
            postData.scheduledAt,
            postData.tags,
            postData.relatedContractId,
            postData.viewCount,
            postData.likeCount,
            postData.metadata,
            [...postData.revisions],
            postData.allowComments,
            postData.pinned
          );

          await this.save(post);
          result.imported++;
        } catch (error) {
          result.errors.push(`Post ${postData.id}: ${error.message}`);
        }
      }
    } catch (error) {
      result.errors.push(`JSON parsing error: ${error.message}`);
    }

    return result;
  }

  private buildQuery(filter?: PostFilter): any {
    const query: any = {};

    if (filter?.status) query.status = filter.status;
    if (filter?.category) query.category = filter.category;
    if (filter?.authorId) query.authorId = filter.authorId;
    if (filter?.tags?.length) query.tags = { $in: filter.tags };
    if (filter?.featured !== undefined) query['metadata.featured'] = filter.featured;
    if (filter?.pinned !== undefined) query.pinned = filter.pinned;
    if (filter?.allowComments !== undefined) query.allowComments = filter.allowComments;
    if (filter?.relatedContractId) query.relatedContractId = filter.relatedContractId;

    if (filter?.search) {
      query.$text = { $search: filter.search };
    }

    if (filter?.dateRange) {
      query.publishedAt = {
        $gte: filter.dateRange.start,
        $lte: filter.dateRange.end
      };
    }

    return query;
  }

  private buildSortOptions(pagination?: PostPagination): any {
    if (!pagination?.sortBy) {
      return { createdAt: -1 };
    }

    const sortOrder = pagination.sortOrder === 'asc' ? 1 : -1;
    return { [pagination.sortBy]: sortOrder };
  }

  private mapToEntity(doc: PostDocument): Post {
    return new Post(
      doc.id,
      doc.title,
      doc.content,
      doc.summary,
      doc.status,
      doc.category,
      doc.authorId,
      doc.authorName,
      doc.createdAt,
      doc.updatedAt,
      doc.publishedAt,
      doc.scheduledAt,
      doc.tags,
      doc.relatedContractId,
      doc.viewCount,
      doc.likeCount,
      doc.metadata,
      doc.revisions,
      doc.allowComments,
      doc.pinned
    );
  }

  private mapToDocument(post: Post): PostDocument {
    return {
      id: post.id,
      title: post.title,
      content: post.content,
      summary: post.summary,
      status: post.status,
      category: post.category,
      authorId: post.authorId,
      authorName: post.authorName,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      publishedAt: post.publishedAt,
      scheduledAt: post.scheduledAt,
      tags: post.tags,
      relatedContractId: post.relatedContractId,
      viewCount: post.viewCount,
      likeCount: post.likeCount,
      metadata: post.metadata,
      revisions: [...post.revisions],
      allowComments: post.allowComments,
      pinned: post.pinned
    };
  }
}