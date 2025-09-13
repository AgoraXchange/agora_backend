import Joi from 'joi';
import { UserRole } from '../../domain/entities/User';
import { ActivityAction } from '../../domain/entities/ActivityLog';

// User management schemas
export const createUserSchema = Joi.object({
  body: Joi.object({
    username: Joi.string()
      .alphanum()
      .min(3)
      .max(50)
      .required()
      .messages({
        'string.alphanum': 'Username must contain only alphanumeric characters',
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username cannot exceed 50 characters'
      }),
    email: Joi.string()
      .email()
      .max(255)
      .optional()
      .messages({
        'string.email': 'Email must be a valid email address',
        'string.max': 'Email cannot exceed 255 characters'
      }),
    password: Joi.string()
      .min(8)
      .max(128)
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters long',
        'string.max': 'Password cannot exceed 128 characters'
      }),
    role: Joi.string()
      .valid(...Object.values(UserRole))
      .required()
      .messages({
        'any.only': `Role must be one of: ${Object.values(UserRole).join(', ')}`
      })
  })
});

export const updateUserSchema = Joi.object({
  params: Joi.object({
    userId: Joi.string()
      .min(1)
      .max(100)
      .required()
      .messages({
        'string.empty': 'User ID cannot be empty',
        'string.max': 'User ID cannot exceed 100 characters'
      })
  }),
  body: Joi.object({
    email: Joi.string()
      .email()
      .max(255)
      .optional()
      .messages({
        'string.email': 'Email must be a valid email address',
        'string.max': 'Email cannot exceed 255 characters'
      }),
    role: Joi.string()
      .valid(...Object.values(UserRole))
      .optional()
      .messages({
        'any.only': `Role must be one of: ${Object.values(UserRole).join(', ')}`
      }),
    active: Joi.boolean()
      .optional()
      .messages({
        'boolean.base': 'Active must be a boolean value'
      })
  }).min(1) // At least one field must be provided
});

export const getUsersSchema = Joi.object({
  query: Joi.object({
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
      .max(100)
      .optional()
      .messages({
        'number.base': 'Limit must be a number',
        'number.integer': 'Limit must be an integer',
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit cannot exceed 100'
      }),
    role: Joi.string()
      .valid(...Object.values(UserRole))
      .optional()
      .messages({
        'any.only': `Role must be one of: ${Object.values(UserRole).join(', ')}`
      })
  })
});

export const deleteUserSchema = Joi.object({
  params: Joi.object({
    userId: Joi.string()
      .min(1)
      .max(100)
      .required()
      .messages({
        'string.empty': 'User ID cannot be empty',
        'string.max': 'User ID cannot exceed 100 characters'
      })
  })
});

// Activity log schemas
export const getActivityLogsSchema = Joi.object({
  query: Joi.object({
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
      .max(500)
      .optional()
      .messages({
        'number.base': 'Limit must be a number',
        'number.integer': 'Limit must be an integer',
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit cannot exceed 500'
      }),
    userId: Joi.string()
      .max(100)
      .optional()
      .messages({
        'string.max': 'User ID cannot exceed 100 characters'
      }),
    action: Joi.string()
      .valid(...Object.values(ActivityAction))
      .optional()
      .messages({
        'any.only': `Action must be one of: ${Object.values(ActivityAction).join(', ')}`
      }),
    resource: Joi.string()
      .max(100)
      .optional()
      .messages({
        'string.max': 'Resource cannot exceed 100 characters'
      }),
    startDate: Joi.date()
      .iso()
      .optional()
      .messages({
        'date.format': 'Start date must be in ISO format'
      }),
    endDate: Joi.date()
      .iso()
      .min(Joi.ref('startDate'))
      .optional()
      .messages({
        'date.format': 'End date must be in ISO format',
        'date.min': 'End date must be after start date'
      })
  })
});

// API Key management schemas
export const createApiKeySchema = Joi.object({
  params: Joi.object({
    userId: Joi.string()
      .min(1)
      .max(100)
      .required()
      .messages({
        'string.empty': 'User ID cannot be empty',
        'string.max': 'User ID cannot exceed 100 characters'
      })
  }),
  body: Joi.object({
    name: Joi.string()
      .min(1)
      .max(100)
      .required()
      .messages({
        'string.empty': 'API key name cannot be empty',
        'string.max': 'API key name cannot exceed 100 characters'
      })
  })
});

export const deleteApiKeySchema = Joi.object({
  params: Joi.object({
    userId: Joi.string()
      .min(1)
      .max(100)
      .required()
      .messages({
        'string.empty': 'User ID cannot be empty',
        'string.max': 'User ID cannot exceed 100 characters'
      }),
    keyId: Joi.string()
      .min(1)
      .max(100)
      .required()
      .messages({
        'string.empty': 'API key ID cannot be empty',
        'string.max': 'API key ID cannot exceed 100 characters'
      })
  })
});

// System configuration schemas
export const updateConfigSchema = Joi.object({
  body: Joi.object({
    key: Joi.string()
      .min(1)
      .max(100)
      .required()
      .messages({
        'string.empty': 'Configuration key cannot be empty',
        'string.max': 'Configuration key cannot exceed 100 characters'
      }),
    value: Joi.any()
      .required()
      .messages({
        'any.required': 'Configuration value is required'
      }),
    description: Joi.string()
      .max(500)
      .optional()
      .messages({
        'string.max': 'Description cannot exceed 500 characters'
      })
  })
});

// Dashboard and stats schemas
export const getDashboardSchema = Joi.object({
  query: Joi.object({
    period: Joi.string()
      .valid('24h', '7d', '30d', '90d')
      .optional()
      .messages({
        'any.only': 'Period must be one of: 24h, 7d, 30d, 90d'
      })
  })
});

export const getStatsSchema = Joi.object({
  query: Joi.object({
    startDate: Joi.date()
      .iso()
      .optional()
      .messages({
        'date.format': 'Start date must be in ISO format'
      }),
    endDate: Joi.date()
      .iso()
      .min(Joi.ref('startDate'))
      .optional()
      .messages({
        'date.format': 'End date must be in ISO format',
        'date.min': 'End date must be after start date'
      }),
    granularity: Joi.string()
      .valid('hour', 'day', 'week', 'month')
      .optional()
      .messages({
        'any.only': 'Granularity must be one of: hour, day, week, month'
      })
  })
});