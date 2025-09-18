import Joi from 'joi';
import { PromptCategory, PromptLanguage, PromptStatus } from '../../domain/entities/PromptTemplate';
import { PostCategory, PostStatus } from '../../domain/entities/Post';
import { CommentType, CommentStatus, CommentSupportingSide } from '../../domain/entities/Comment';

// ============= PROMPT TEMPLATE VALIDATION =============

export const createPromptTemplateSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  category: Joi.string().valid(...Object.values(PromptCategory)).required(),
  language: Joi.string().valid(...Object.values(PromptLanguage)).required(),
  template: Joi.string().min(10).max(10000).required(),
  variables: Joi.array().items(Joi.string().pattern(/^[a-zA-Z_][a-zA-Z0-9_]*$/)).required(),
  description: Joi.string().max(500).optional(),
  tags: Joi.array().items(Joi.string().max(50)).max(10).optional()
});

export const updatePromptTemplateSchema = Joi.object({
  name: Joi.string().min(3).max(100).optional(),
  template: Joi.string().min(10).max(10000).optional(),
  variables: Joi.array().items(Joi.string().pattern(/^[a-zA-Z_][a-zA-Z0-9_]*$/)).optional(),
  description: Joi.string().max(500).allow('').optional(),
  status: Joi.string().valid(...Object.values(PromptStatus)).optional(),
  tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
  notes: Joi.string().max(1000).optional()
});

export const promptTemplateFilterSchema = Joi.object({
  category: Joi.string().valid(...Object.values(PromptCategory)).optional(),
  language: Joi.string().valid(...Object.values(PromptLanguage)).optional(),
  status: Joi.string().valid(...Object.values(PromptStatus)).optional(),
  createdBy: Joi.string().optional(),
  search: Joi.string().max(100).optional(),
  tags: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string())
  ).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('name', 'createdAt', 'updatedAt', 'usageCount').optional(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

export const recordUsageSchema = Joi.object({
  templateId: Joi.string().required(),
  version: Joi.string().required(),
  successRate: Joi.number().min(0).max(1).optional(),
  responseTime: Joi.number().positive().optional(),
  incrementUsage: Joi.boolean().default(true)
});

// ============= POST VALIDATION =============

export const createPostSchema = Joi.object({
  title: Joi.string().min(5).max(200).required(),
  content: Joi.string().min(50).max(50000).required(),
  summary: Joi.string().min(10).max(500).required(),
  category: Joi.string().valid(...Object.values(PostCategory)).required(),
  tags: Joi.array().items(Joi.string().max(50)).max(20).optional(),
  relatedContractId: Joi.string().optional(),
  allowComments: Joi.boolean().default(true),
  metadata: Joi.object({
    seoTitle: Joi.string().max(60).optional(),
    seoDescription: Joi.string().max(160).optional(),
    seoKeywords: Joi.array().items(Joi.string().max(50)).max(10).optional(),
    socialImage: Joi.string().uri().optional(),
    canonicalUrl: Joi.string().uri().optional(),
    featured: Joi.boolean().optional()
  }).optional()
});

export const updatePostSchema = Joi.object({
  title: Joi.string().min(5).max(200).optional(),
  content: Joi.string().min(50).max(50000).optional(),
  summary: Joi.string().min(10).max(500).optional(),
  category: Joi.string().valid(...Object.values(PostCategory)).optional(),
  tags: Joi.array().items(Joi.string().max(50)).max(20).optional(),
  allowComments: Joi.boolean().optional(),
  pinned: Joi.boolean().optional(),
  changeLog: Joi.string().max(200).optional(),
  metadata: Joi.object({
    seoTitle: Joi.string().max(60).optional(),
    seoDescription: Joi.string().max(160).optional(),
    seoKeywords: Joi.array().items(Joi.string().max(50)).max(10).optional(),
    socialImage: Joi.string().uri().optional(),
    canonicalUrl: Joi.string().uri().optional(),
    featured: Joi.boolean().optional(),
    readingTime: Joi.number().positive().optional()
  }).optional()
});

export const schedulePostSchema = Joi.object({
  scheduledAt: Joi.date().greater('now').required()
});

export const postFilterSchema = Joi.object({
  status: Joi.string().valid(...Object.values(PostStatus)).optional(),
  category: Joi.string().valid(...Object.values(PostCategory)).optional(),
  authorId: Joi.string().optional(),
  search: Joi.string().max(100).optional(),
  featured: Joi.boolean().optional(),
  pinned: Joi.boolean().optional(),
  tags: Joi.alternatives().try(
    Joi.string(),
    Joi.array().items(Joi.string())
  ).optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().min(Joi.ref('startDate')).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('title', 'createdAt', 'updatedAt', 'publishedAt', 'viewCount', 'likeCount').optional(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

export const bulkPostUpdateSchema = Joi.object({
  postIds: Joi.array().items(Joi.string()).min(1).max(100).required(),
  updates: Joi.object({
    status: Joi.string().valid(...Object.values(PostStatus)).optional(),
    category: Joi.string().valid(...Object.values(PostCategory)).optional(),
    pinned: Joi.boolean().optional(),
    allowComments: Joi.boolean().optional()
  }).min(1).required()
});

// ============= COMMENT VALIDATION =============

export const createCommentSchema = Joi.object({
  parentId: Joi.string().required(),
  parentType: Joi.string().valid(...Object.values(CommentType)).required(),
  author: Joi.string().required(),
  authorName: Joi.string().max(100).optional(),
  content: Joi.string().min(1).max(2000).required(),
  supportingSide: Joi.string().valid(...Object.values(CommentSupportingSide)).optional(),
  replyTo: Joi.string().optional()
});

export const updateCommentSchema = Joi.object({
  content: Joi.string().min(1).max(2000).optional(),
  supportingSide: Joi.string().valid(...Object.values(CommentSupportingSide)).optional(),
  reason: Joi.string().max(200).optional()
});

export const moderateCommentSchema = Joi.object({
  action: Joi.string().valid('approve', 'reject', 'spam', 'hide', 'restore').required(),
  reason: Joi.string().max(500).optional()
});

export const bulkModerationSchema = Joi.object({
  commentIds: Joi.array().items(Joi.string()).min(1).max(100).required(),
  action: Joi.string().valid('approve', 'reject', 'spam', 'hide').required()
});

export const flagCommentSchema = Joi.object({
  reason: Joi.string().valid(
    'spam',
    'inappropriate',
    'harassment',
    'misinformation',
    'off-topic',
    'other'
  ).required(),
  description: Joi.string().max(500).optional()
});

export const resolveFlagSchema = Joi.object({
  flagId: Joi.string().required(),
  action: Joi.string().valid('dismissed', 'warning', 'removed', 'banned').optional()
});

export const addAdminNoteSchema = Joi.object({
  note: Joi.string().min(1).max(1000).required(),
  isInternal: Joi.boolean().default(true)
});

export const commentFilterSchema = Joi.object({
  parentId: Joi.string().optional(),
  parentType: Joi.string().valid(...Object.values(CommentType)).optional(),
  author: Joi.string().optional(),
  status: Joi.string().valid(...Object.values(CommentStatus)).optional(),
  supportingSide: Joi.string().valid(...Object.values(CommentSupportingSide)).optional(),
  isFlagged: Joi.boolean().optional(),
  isSpam: Joi.boolean().optional(),
  search: Joi.string().max(100).optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().min(Joi.ref('startDate')).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  sortBy: Joi.string().valid('timestamp', 'netVotes', 'engagementScore', 'flagCount').optional(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

export const autoModerationSchema = Joi.object({
  spamKeywords: Joi.array().items(Joi.string().max(50)).max(100).optional(),
  minVotesForAutoApprove: Joi.number().integer().min(1).optional(),
  maxFlagsForAutoReject: Joi.number().integer().min(1).optional()
});

export const voteSchema = Joi.object({
  voteType: Joi.string().valid('up', 'down', 'remove_up', 'remove_down').required()
});

// ============= SHARED VALIDATION =============

export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

export const searchSchema = Joi.object({
  query: Joi.string().min(2).max(100).required(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});

export const bulkDeleteSchema = Joi.object({
  ids: Joi.array().items(Joi.string()).min(1).max(100).required()
});

export const exportFilterSchema = Joi.object({
  format: Joi.string().valid('json', 'csv').default('json'),
  startDate: Joi.date().optional(),
  endDate: Joi.date().min(Joi.ref('startDate')).optional()
});

export const importSchema = Joi.object({
  data: Joi.string().required(),
  overwrite: Joi.boolean().default(false)
});

// ============= ANALYTICS VALIDATION =============

export const analyticsTimeRangeSchema = Joi.object({
  timeRange: Joi.string().valid('day', 'week', 'month', 'year').optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().min(Joi.ref('startDate')).optional()
});

export const dashboardFiltersSchema = Joi.object({
  timeRange: Joi.string().valid('day', 'week', 'month', 'year').default('month'),
  includeArchived: Joi.boolean().default(false)
});

// Helper function to validate request body
export const validateBody = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          }))
        }
      });
    }

    req.body = value;
    next();
  };
};

// Helper function to validate query parameters
export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.query, { abortEarly: false });

    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          }))
        }
      });
    }

    req.query = value;
    next();
  };
};

// Helper function to validate path parameters
export const validateParams = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req.params, { abortEarly: false });

    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid path parameters',
          details: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          }))
        }
      });
    }

    req.params = value;
    next();
  };
};

// Common parameter schemas
export const idParamSchema = Joi.object({
  id: Joi.string().required()
});

export const slugParamSchema = Joi.object({
  slug: Joi.string().min(1).max(200).required()
});