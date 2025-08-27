import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from '../../domain/errors/AppError';
import { logger } from '../../infrastructure/logging/Logger';

export function validate(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const validationObject: any = {};
    
    if (schema.describe().keys.body) {
      validationObject.body = req.body;
    }
    if (schema.describe().keys.params) {
      validationObject.params = req.params;
    }
    if (schema.describe().keys.query) {
      validationObject.query = req.query;
    }

    const { error, value } = schema.validate(validationObject, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      logger.warn('Validation failed', { 
        path: req.path, 
        errors: details 
      });

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details
      });
    }

    if (value.body) req.body = value.body;
    if (value.params) req.params = value.params;
    if (value.query) req.query = value.query;

    next();
  };
}