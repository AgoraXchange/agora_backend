import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger } from '../../infrastructure/logging/Logger';

export const createRateLimiter = (
  windowMs: number = 15 * 60 * 1000, // 15 minutes
  max: number = 100,
  message: string = 'Too many requests from this IP, please try again later'
) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: message,
      code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      logger.warn('Rate limit exceeded', { 
        ip: req.ip,
        path: req.path,
        method: req.method
      });
      
      res.status(429).json({
        success: false,
        error: message,
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }
  });
};

// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV === 'development';

export const apiRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  isDevelopment ? 1000 : 100 // More lenient in development
);

export const authRateLimiter = createRateLimiter(
  isDevelopment ? 60 * 1000 : 15 * 60 * 1000, // 1 minute in dev, 15 minutes in prod
  isDevelopment ? 100 : 5 // 100 attempts per minute in dev, 5 per 15 min in prod
);

export const oracleRateLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  isDevelopment ? 100 : 10 // More lenient in development
);