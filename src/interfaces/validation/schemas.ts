import Joi from 'joi';

export const contractIdSchema = Joi.object({
  contractId: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .min(1)
    .max(64)
    .required()
    .messages({
      'string.pattern.base': 'Contract ID must contain only alphanumeric characters, hyphens, and underscores',
      'string.empty': 'Contract ID cannot be empty',
      'string.max': 'Contract ID cannot exceed 64 characters'
    })
});

export const decideWinnerSchema = Joi.object({
  params: contractIdSchema,
  body: Joi.object({})
});

export const loginBodySchema = Joi.object({
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(30)
    .required()
    .messages({
      'string.alphanum': 'Username must contain only alphanumeric characters',
      'string.min': 'Username must be at least 3 characters long',
      'string.max': 'Username cannot exceed 30 characters'
    }),
  password: Joi.string()
    .min(8)
    .max(128)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password cannot exceed 128 characters'
    })
});

export const loginSchema = Joi.object({
  body: loginBodySchema
});

export const ethereumAddressSchema = Joi.string()
  .pattern(/^0x[a-fA-F0-9]{40}$/)
  .messages({
    'string.pattern.base': 'Invalid Ethereum address format'
  });

export const createContractSchema = Joi.object({
  contractAddress: ethereumAddressSchema.required(),
  partyA: Joi.object({
    id: Joi.string().required(),
    address: ethereumAddressSchema.required(),
    name: Joi.string().max(100).required(),
    description: Joi.string().max(500).required()
  }).required(),
  partyB: Joi.object({
    id: Joi.string().required(),
    address: ethereumAddressSchema.required(),
    name: Joi.string().max(100).required(),
    description: Joi.string().max(500).required()
  }).required(),
  bettingEndTime: Joi.date().iso().greater('now').required(),
  winnerRewardPercentage: Joi.number().min(0).max(100).required()
});

// Deliberation visualization schemas
export const deliberationParamsSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .min(1)
    .max(128)
    .required()
    .messages({
      'string.pattern.base': 'Deliberation ID must contain only alphanumeric characters, hyphens, and underscores',
      'string.empty': 'Deliberation ID cannot be empty',
      'string.max': 'Deliberation ID cannot exceed 128 characters'
    })
});

export const deliberationQuerySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .optional()
    .messages({
      'number.base': 'Page must be a number',
      'number.integer': 'Page must be an integer',
      'number.min': 'Page must be at least 1',
      'number.max': 'Page cannot exceed 1000'
    }),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(200)
    .optional()
    .messages({
      'number.base': 'Limit must be a number',
      'number.integer': 'Limit must be an integer',
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 200'
    }),
  phase: Joi.string()
    .valid('proposing', 'discussion', 'consensus', 'completed')
    .optional()
    .messages({
      'any.only': 'Phase must be one of: proposing, discussion, consensus, completed'
    }),
  agentId: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .max(64)
    .optional()
    .messages({
      'string.pattern.base': 'Agent ID must contain only alphanumeric characters, hyphens, and underscores',
      'string.max': 'Agent ID cannot exceed 64 characters'
    }),
  format: Joi.string()
    .valid('json', 'csv')
    .optional()
    .messages({
      'any.only': 'Format must be either json or csv'
    })
});

export const committeeDecisionSchema = Joi.object({
  forceCommitteeMode: Joi.boolean().optional(),
  committeeConfig: Joi.object({
    minProposals: Joi.number().integer().min(1).max(10).optional(),
    maxProposalsPerAgent: Joi.number().integer().min(1).max(5).optional(),
    consensusThreshold: Joi.number().min(0).max(1).optional(),
    enableEarlyExit: Joi.boolean().optional()
  }).optional()
}).optional();

// Composite schema for decide winner endpoint
export const decideWinnerValidationSchema = Joi.object({
  params: contractIdSchema,
  body: committeeDecisionSchema
});

// Composite schema for get decision endpoint
export const getDecisionValidationSchema = Joi.object({
  params: contractIdSchema
});

// Composite schemas for deliberation routes
export const getDeliberationSchema = Joi.object({
  params: deliberationParamsSchema
});

export const getDeliberationMessagesSchema = Joi.object({
  params: deliberationParamsSchema,
  query: deliberationQuerySchema
});

export const exportDeliberationSchema = Joi.object({
  params: deliberationParamsSchema
});
