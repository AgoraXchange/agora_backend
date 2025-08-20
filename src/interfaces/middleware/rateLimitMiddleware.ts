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

export const apiRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100 // 100 requests per window
);

export const authRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5 // 5 login attempts per window
);

export const oracleRateLimiter = createRateLimiter(
  60 * 1000, // 1 minute
  10 // 10 oracle requests per minute
);