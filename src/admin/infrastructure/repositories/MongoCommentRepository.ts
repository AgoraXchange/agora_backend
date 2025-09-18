import { inject, injectable } from 'inversify';
import { Collection, Db, ObjectId } from 'mongodb';
import {
  ICommentRepository,
  CommentFilter,
  CommentPagination,
  CommentQueryResult,
  CommentStats,
  CommentModerationResult
} from '../../domain/repositories/ICommentRepository';
import { Comment, CommentStatus, CommentType, CommentSupportingSide, CommentFlag, CommentEdit, AdminNote } from '../../domain/entities/Comment';
import { TYPES } from '../../../types';

interface CommentDocument {
  _id?: ObjectId;
  id: string;
  parentId: string;
  parentType: CommentType;
  author: string;
  authorName?: string;
  content: string;
  timestamp: Date;
  supportingSide?: CommentSupportingSide;
  replyTo?: string;
  upvotes: number;
  downvotes: number;
  status: CommentStatus;
  flags: CommentFlag[];
  edits: CommentEdit[];
  adminNotes: AdminNote[];
  moderatedBy?: string;
  moderatedAt?: Date;
  isEdited: boolean;
  isSpam: boolean;
  metadata: Record<string, any>;
}

@injectable()
export class MongoCommentRepository implements ICommentRepository {
  private collection: Collection<CommentDocument>;

  constructor(@inject(TYPES.MongoClient) db: Db) {
    this.collection = db.collection<CommentDocument>('comments');
    this.ensureIndexes();
  }

  private async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ id: 1 }, { unique: true });
    await this.collection.createIndex({ parentId: 1, parentType: 1 });
    await this.collection.createIndex({ author: 1 });
    await this.collection.createIndex({ status: 1 });
    await this.collection.createIndex({ timestamp: -1 });
    await this.collection.createIndex({ replyTo: 1 });
    await this.collection.createIndex({ isSpam: 1 });
    await this.collection.createIndex({ 'flags.resolved': 1 });
    await this.collection.createIndex({ supportingSide: 1 });
    await this.collection.createIndex({ upvotes: -1, downvotes: 1 });
    await this.collection.createIndex({ content: 'text' });
  }

  async findById(id: string): Promise<Comment | null> {
    const doc = await this.collection.findOne({ id });
    return doc ? this.mapToEntity(doc) : null;
  }

  async findMany(
    filter?: CommentFilter,
    pagination?: CommentPagination
  ): Promise<CommentQueryResult> {
    const query = this.buildQuery(filter);
    const skip = pagination ? (pagination.page - 1) * pagination.limit : 0;
    const limit = pagination?.limit || 50;

    const sortOptions = this.buildSortOptions(pagination);

    const [comments, total] = await Promise.all([
      this.collection.find(query).sort(sortOptions).skip(skip).limit(limit).toArray(),
      this.collection.countDocuments(query)
    ]);

    return {
      comments: comments.map(doc => this.mapToEntity(doc)),
      total,
      page: pagination?.page || 1,
      totalPages: Math.ceil(total / limit)
    };
  }

  async findByParent(
    parentId: string,
    parentType: CommentType,
    includeReplies?: boolean,
    pagination?: CommentPagination
  ): Promise<CommentQueryResult> {
    const query: any = { parentId, parentType };

    if (!includeReplies) {
      query.replyTo = { $exists: false };
    }

    const skip = pagination ? (pagination.page - 1) * pagination.limit : 0;
    const limit = pagination?.limit || 50;
    const sortOptions = this.buildSortOptions(pagination) || { timestamp: 1 };

    const [comments, total] = await Promise.all([
      this.collection.find(query).sort(sortOptions).skip(skip).limit(limit).toArray(),
      this.collection.countDocuments(query)
    ]);

    return {
      comments: comments.map(doc => this.mapToEntity(doc)),
      total,
      page: pagination?.page || 1,
      totalPages: Math.ceil(total / limit)
    };
  }

  async findReplies(
    commentId: string,
    pagination?: CommentPagination
  ): Promise<CommentQueryResult> {
    const query = { replyTo: commentId };
    const skip = pagination ? (pagination.page - 1) * pagination.limit : 0;
    const limit = pagination?.limit || 50;
    const sortOptions = this.buildSortOptions(pagination) || { timestamp: 1 };

    const [comments, total] = await Promise.all([
      this.collection.find(query).sort(sortOptions).skip(skip).limit(limit).toArray(),
      this.collection.countDocuments(query)
    ]);

    return {
      comments: comments.map(doc => this.mapToEntity(doc)),
      total,
      page: pagination?.page || 1,
      totalPages: Math.ceil(total / limit)
    };
  }

  async findByAuthor(
    author: string,
    pagination?: CommentPagination
  ): Promise<CommentQueryResult> {
    return this.findMany({ author }, pagination);
  }

  async findFlagged(
    unresolvedOnly?: boolean,
    pagination?: CommentPagination
  ): Promise<CommentQueryResult> {
    const query: any = {};

    if (unresolvedOnly) {
      query['flags.resolved'] = false;
    } else {
      query.flags = { $ne: [] };
    }

    const skip = pagination ? (pagination.page - 1) * pagination.limit : 0;
    const limit = pagination?.limit || 50;
    const sortOptions = this.buildSortOptions(pagination) || { timestamp: -1 };

    const [comments, total] = await Promise.all([
      this.collection.find(query).sort(sortOptions).skip(skip).limit(limit).toArray(),
      this.collection.countDocuments(query)
    ]);

    return {
      comments: comments.map(doc => this.mapToEntity(doc)),
      total,
      page: pagination?.page || 1,
      totalPages: Math.ceil(total / limit)
    };
  }

  async findPendingModeration(
    pagination?: CommentPagination
  ): Promise<CommentQueryResult> {
    return this.findMany({ status: CommentStatus.PENDING }, pagination);
  }

  async findSpam(
    pagination?: CommentPagination
  ): Promise<CommentQueryResult> {
    return this.findMany({ isSpam: true }, pagination);
  }

  async findInfluential(
    parentId?: string,
    parentType?: CommentType,
    limit?: number
  ): Promise<Comment[]> {
    const query: any = {
      status: CommentStatus.APPROVED,
      $expr: {
        $gt: [{ $subtract: ['$upvotes', '$downvotes'] }, 10]
      }
    };

    if (parentId && parentType) {
      query.parentId = parentId;
      query.parentType = parentType;
    }

    const docs = await this.collection
      .find(query)
      .sort({ upvotes: -1, downvotes: 1 })
      .limit(limit || 20)
      .toArray();

    return docs.map(doc => this.mapToEntity(doc));
  }

  async search(
    query: string,
    filter?: CommentFilter,
    pagination?: CommentPagination
  ): Promise<CommentQueryResult> {
    const searchFilter = { ...filter, search: query };
    return this.findMany(searchFilter, pagination);
  }

  async save(comment: Comment): Promise<void> {
    const doc = this.mapToDocument(comment);
    await this.collection.replaceOne({ id: comment.id }, doc, { upsert: true });
  }

  async update(comment: Comment): Promise<void> {
    const doc = this.mapToDocument(comment);
    await this.collection.replaceOne({ id: comment.id }, doc);
  }

  async delete(id: string): Promise<void> {
    await this.collection.deleteOne({ id });
  }

  async bulkModerate(
    commentIds: string[],
    action: 'approve' | 'reject' | 'spam' | 'hide',
    moderatedBy: string
  ): Promise<CommentModerationResult> {
    const result: CommentModerationResult = {
      processed: 0,
      approved: 0,
      rejected: 0,
      errors: []
    };

    for (const commentId of commentIds) {
      try {
        const comment = await this.findById(commentId);
        if (!comment) {
          result.errors.push(`Comment ${commentId} not found`);
          continue;
        }

        switch (action) {
          case 'approve':
            comment.approve(moderatedBy);
            result.approved++;
            break;
          case 'reject':
            comment.reject(moderatedBy);
            result.rejected++;
            break;
          case 'spam':
            comment.markAsSpam(moderatedBy);
            result.rejected++;
            break;
          case 'hide':
            comment.hide(moderatedBy);
            result.rejected++;
            break;
        }

        await this.update(comment);
        result.processed++;
      } catch (error) {
        result.errors.push(`Comment ${commentId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return result;
  }

  async bulkDelete(commentIds: string[]): Promise<number> {
    const result = await this.collection.deleteMany({ id: { $in: commentIds } });
    return result.deletedCount;
  }

  async autoModerate(rules: {
    spamKeywords?: string[];
    minVotesForAutoApprove?: number;
    maxFlagsForAutoReject?: number;
  }): Promise<CommentModerationResult> {
    const result: CommentModerationResult = {
      processed: 0,
      approved: 0,
      rejected: 0,
      errors: []
    };

    // Find pending comments
    const pendingComments = await this.collection.find({ status: CommentStatus.PENDING }).toArray();

    for (const doc of pendingComments) {
      try {
        const comment = this.mapToEntity(doc);
        let shouldModerate = false;
        let action: 'approve' | 'reject' = 'approve';

        // Check spam keywords
        if (rules.spamKeywords?.length) {
          const contentLower = comment.content.toLowerCase();
          const hasSpamKeyword = rules.spamKeywords.some(keyword =>
            contentLower.includes(keyword.toLowerCase())
          );
          if (hasSpamKeyword) {
            shouldModerate = true;
            action = 'reject';
            comment.markAsSpam('system');
          }
        }

        // Auto-approve based on votes
        if (!shouldModerate && rules.minVotesForAutoApprove) {
          if (comment.netVotes >= rules.minVotesForAutoApprove) {
            shouldModerate = true;
            action = 'approve';
          }
        }

        // Auto-reject based on flags
        if (!shouldModerate && rules.maxFlagsForAutoReject) {
          if (comment.flagCount >= rules.maxFlagsForAutoReject) {
            shouldModerate = true;
            action = 'reject';
          }
        }

        if (shouldModerate) {
          if (action === 'approve') {
            comment.approve('system');
            result.approved++;
          } else {
            comment.reject('system');
            result.rejected++;
          }

          await this.update(comment);
          result.processed++;
        }
      } catch (error) {
        result.errors.push(`Comment ${doc.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return result;
  }

  async getStats(filter?: CommentFilter): Promise<CommentStats> {
    const query = this.buildQuery(filter);

    const [
      totalComments,
      pendingComments,
      approvedComments,
      rejectedComments,
      spamComments,
      flaggedComments,
      aggregateStats
    ] = await Promise.all([
      this.collection.countDocuments(query),
      this.collection.countDocuments({ ...query, status: CommentStatus.PENDING }),
      this.collection.countDocuments({ ...query, status: CommentStatus.APPROVED }),
      this.collection.countDocuments({ ...query, status: CommentStatus.REJECTED }),
      this.collection.countDocuments({ ...query, isSpam: true }),
      this.collection.countDocuments({ ...query, 'flags.resolved': false }),
      this.collection.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalFlags: { $sum: { $size: '$flags' } },
            avgEngagement: {
              $avg: {
                $multiply: [
                  { $add: ['$upvotes', '$downvotes'] },
                  { $add: [0.5, { $multiply: [0.5, { $divide: [{ $subtract: ['$upvotes', '$downvotes'] }, { $add: ['$upvotes', '$downvotes', 1] }] }] }] }
                ]
              }
            }
          }
        }
      ]).toArray()
    ]);

    const stats = aggregateStats[0] || { totalFlags: 0, avgEngagement: 0 };

    // Get top contributors
    const topContributors = await this.collection.aggregate([
      { $match: { ...query, status: CommentStatus.APPROVED } },
      {
        $group: {
          _id: '$author',
          commentCount: { $sum: 1 },
          averageScore: { $avg: { $subtract: ['$upvotes', '$downvotes'] } }
        }
      },
      { $sort: { commentCount: -1 } },
      { $limit: 10 }
    ]).toArray();

    return {
      totalComments,
      pendingComments,
      approvedComments,
      rejectedComments,
      spamComments,
      flaggedComments,
      totalFlags: stats.totalFlags,
      averageEngagementScore: stats.avgEngagement,
      topContributors: topContributors.map(contributor => ({
        author: contributor._id,
        commentCount: contributor.commentCount,
        averageScore: contributor.averageScore
      }))
    };
  }

  async count(filter?: CommentFilter): Promise<number> {
    const query = this.buildQuery(filter);
    return this.collection.countDocuments(query);
  }

  async getCommentTree(
    parentId: string,
    parentType: CommentType,
    maxDepth?: number
  ): Promise<Comment[]> {
    const comments = await this.collection.find({
      parentId,
      parentType,
      status: CommentStatus.APPROVED
    }).sort({ timestamp: 1 }).toArray();

    const commentMap = new Map<string, Comment>();
    const topLevel: Comment[] = [];

    // Build comment objects
    for (const doc of comments) {
      const comment = this.mapToEntity(doc);
      commentMap.set(comment.id, comment);

      if (!comment.replyTo) {
        topLevel.push(comment);
      }
    }

    // Build tree structure (simplified - returns flat list for now)
    return topLevel;
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
      dateFilter = { timestamp: { $gte: pastDate } };
    }

    const topCommenters = await this.collection.aggregate([
      { $match: { status: CommentStatus.APPROVED, ...dateFilter } },
      {
        $group: {
          _id: { author: '$author', authorName: '$authorName' },
          commentCount: { $sum: 1 },
          averageScore: { $avg: { $subtract: ['$upvotes', '$downvotes'] } },
          totalVotes: { $sum: { $add: ['$upvotes', '$downvotes'] } }
        }
      },
      { $sort: { commentCount: -1 } },
      { $limit: limit || 20 }
    ]).toArray();

    return topCommenters.map(commenter => ({
      author: commenter._id.author,
      authorName: commenter._id.authorName,
      commentCount: commenter.commentCount,
      averageScore: commenter.averageScore,
      totalVotes: commenter.totalVotes
    }));
  }

  async getCommentsNeedingAttention(): Promise<Comment[]> {
    const query = {
      $or: [
        { 'flags.resolved': false },
        { isSpam: true, status: { $ne: CommentStatus.SPAM } },
        { status: CommentStatus.PENDING, timestamp: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
      ]
    };

    const docs = await this.collection.find(query).sort({ timestamp: -1 }).limit(100).toArray();
    return docs.map(doc => this.mapToEntity(doc));
  }

  async updateVotes(commentId: string, upvotes: number, downvotes: number): Promise<void> {
    await this.collection.updateOne(
      { id: commentId },
      { $set: { upvotes, downvotes } }
    );
  }

  async archiveOldComments(olderThan: Date): Promise<number> {
    const result = await this.collection.updateMany(
      {
        timestamp: { $lt: olderThan },
        status: { $in: [CommentStatus.APPROVED, CommentStatus.REJECTED] }
      },
      { $set: { 'metadata.archived': true } }
    );

    return result.modifiedCount;
  }

  async cleanupSpam(olderThan: Date): Promise<number> {
    const result = await this.collection.deleteMany({
      isSpam: true,
      status: CommentStatus.SPAM,
      timestamp: { $lt: olderThan }
    });

    return result.deletedCount;
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
    // This would typically be stored in a separate moderation_history collection
    // For now, we'll return moderation info from comments
    const query: any = { moderatedBy: { $exists: true } };

    if (commentId) query.id = commentId;
    if (moderatorId) query.moderatedBy = moderatorId;

    const docs = await this.collection.find(query)
      .sort({ moderatedAt: -1 })
      .limit(pagination?.limit || 100)
      .toArray();

    return docs.map(doc => ({
      commentId: doc.id,
      action: doc.status,
      moderatedBy: doc.moderatedBy!,
      moderatedAt: doc.moderatedAt!,
      reason: doc.metadata?.moderationReason
    }));
  }

  async exportComments(filter?: CommentFilter): Promise<string> {
    const query = this.buildQuery(filter);
    const docs = await this.collection.find(query).toArray();
    const comments = docs.map(doc => this.mapToEntity(doc));
    return JSON.stringify(comments, null, 2);
  }

  async importComments(commentsJson: string): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    const result = { imported: 0, skipped: 0, errors: [] as string[] };

    try {
      const comments = JSON.parse(commentsJson) as Comment[];

      for (const commentData of comments) {
        try {
          const existing = await this.findById(commentData.id);
          if (existing) {
            result.skipped++;
            continue;
          }

          const comment = new Comment(
            commentData.id,
            commentData.parentId,
            commentData.parentType,
            commentData.author,
            commentData.authorName,
            commentData.content,
            commentData.timestamp,
            commentData.supportingSide,
            commentData.replyTo,
            commentData.upvotes,
            commentData.downvotes,
            commentData.status,
            [...commentData.flags],
            [...commentData.edits],
            [...commentData.adminNotes],
            commentData.moderatedBy,
            commentData.moderatedAt,
            commentData.isEdited,
            commentData.isSpam,
            commentData.metadata
          );

          await this.save(comment);
          result.imported++;
        } catch (error) {
          result.errors.push(`Comment ${commentData.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      result.errors.push(`JSON parsing error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  async detectSpam(content: string, author: string): Promise<{
    isSpam: boolean;
    confidence: number;
    reasons: string[];
  }> {
    const reasons: string[] = [];
    let spamScore = 0;

    // Simple spam detection rules
    const spamKeywords = ['spam', 'viagra', 'casino', 'lottery', 'winner'];
    const contentLower = content.toLowerCase();

    for (const keyword of spamKeywords) {
      if (contentLower.includes(keyword)) {
        reasons.push(`Contains spam keyword: ${keyword}`);
        spamScore += 0.3;
      }
    }

    // Check for excessive caps
    const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    if (capsRatio > 0.7) {
      reasons.push('Excessive capital letters');
      spamScore += 0.2;
    }

    // Check for repeated characters
    if (/(.)\1{4,}/.test(content)) {
      reasons.push('Repeated characters detected');
      spamScore += 0.2;
    }

    // Check for URL patterns
    if (/https?:\/\//.test(content)) {
      reasons.push('Contains URLs');
      spamScore += 0.1;
    }

    const confidence = Math.min(spamScore, 1);
    const isSpam = confidence > 0.6;

    return { isSpam, confidence, reasons };
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
    const query: any = { status: CommentStatus.APPROVED };

    if (parentId && parentType) {
      query.parentId = parentId;
      query.parentType = parentType;
    }

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
      }
      query.timestamp = { $gte: pastDate };
    }

    const [stats, trend] = await Promise.all([
      this.collection.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalComments: { $sum: 1 },
            averageLength: { $avg: { $strLenCP: '$content' } },
            repliesCount: { $sum: { $cond: [{ $ne: ['$replyTo', null] }, 1, 0] } }
          }
        }
      ]).toArray(),
      this.collection.aggregate([
        { $match: query },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            commentCount: { $sum: 1 },
            averageVotes: { $avg: { $add: ['$upvotes', '$downvotes'] } }
          }
        },
        { $sort: { _id: 1 } }
      ]).toArray()
    ]);

    const baseStats = stats[0] || { totalComments: 0, averageLength: 0, repliesCount: 0 };
    const responseRate = baseStats.totalComments > 0 ? baseStats.repliesCount / baseStats.totalComments : 0;

    return {
      totalComments: baseStats.totalComments,
      averageLength: baseStats.averageLength,
      responseRate,
      engagementTrend: trend.map(item => ({
        date: new Date(item._id),
        commentCount: item.commentCount,
        averageVotes: item.averageVotes
      }))
    };
  }

  private buildQuery(filter?: CommentFilter): any {
    const query: any = {};

    if (filter?.parentId) query.parentId = filter.parentId;
    if (filter?.parentType) query.parentType = filter.parentType;
    if (filter?.author) query.author = filter.author;
    if (filter?.status) query.status = filter.status;
    if (filter?.supportingSide) query.supportingSide = filter.supportingSide;
    if (filter?.isFlagged !== undefined) {
      query['flags.resolved'] = filter.isFlagged ? false : { $ne: false };
    }
    if (filter?.isSpam !== undefined) query.isSpam = filter.isSpam;
    if (filter?.moderatedBy) query.moderatedBy = filter.moderatedBy;

    if (filter?.search) {
      query.$text = { $search: filter.search };
    }

    if (filter?.dateRange) {
      query.timestamp = {
        $gte: filter.dateRange.start,
        $lte: filter.dateRange.end
      };
    }

    if (filter?.votesRange) {
      const netVotes = { $subtract: ['$upvotes', '$downvotes'] };
      query.$expr = {
        $and: [
          { $gte: [netVotes, filter.votesRange.min] },
          { $lte: [netVotes, filter.votesRange.max] }
        ]
      };
    }

    return query;
  }

  private buildSortOptions(pagination?: CommentPagination): any {
    if (!pagination?.sortBy) {
      return { timestamp: -1 };
    }

    const sortOrder = pagination.sortOrder === 'asc' ? 1 : -1;

    switch (pagination.sortBy) {
      case 'netVotes':
        return { upvotes: sortOrder, downvotes: -sortOrder };
      case 'engagementScore':
        // MongoDB doesn't support complex calculations in sort, use timestamp as fallback
        return { timestamp: sortOrder };
      case 'flagCount':
        // Use array size for sorting flags
        return { 'flags': sortOrder };
      default:
        return { [pagination.sortBy]: sortOrder };
    }
  }

  private mapToEntity(doc: CommentDocument): Comment {
    return new Comment(
      doc.id,
      doc.parentId,
      doc.parentType,
      doc.author,
      doc.authorName,
      doc.content,
      doc.timestamp,
      doc.supportingSide,
      doc.replyTo,
      doc.upvotes,
      doc.downvotes,
      doc.status,
      doc.flags,
      doc.edits,
      doc.adminNotes,
      doc.moderatedBy,
      doc.moderatedAt,
      doc.isEdited,
      doc.isSpam,
      doc.metadata
    );
  }

  private mapToDocument(comment: Comment): CommentDocument {
    return {
      id: comment.id,
      parentId: comment.parentId,
      parentType: comment.parentType,
      author: comment.author,
      authorName: comment.authorName,
      content: comment.content,
      timestamp: comment.timestamp,
      supportingSide: comment.supportingSide,
      replyTo: comment.replyTo,
      upvotes: comment.upvotes,
      downvotes: comment.downvotes,
      status: comment.status,
      flags: comment.flags as CommentFlag[],
      edits: comment.edits as CommentEdit[],
      adminNotes: comment.adminNotes as AdminNote[],
      moderatedBy: comment.moderatedBy,
      moderatedAt: comment.moderatedAt,
      isEdited: comment.isEdited,
      isSpam: comment.isSpam,
      metadata: comment.metadata
    };
  }
}