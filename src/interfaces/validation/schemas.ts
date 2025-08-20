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

export const loginSchema = Joi.object({
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