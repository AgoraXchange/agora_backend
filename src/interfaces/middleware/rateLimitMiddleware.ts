import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../../infrastructure/logging/Logger';

export const createRateLimiter = (
  windowMs: number = 15 * 60 * 1000, // 15 minutes
  max: number = 100,
  message: string = 'Too many requests from this IP, please try again later'
) => {
  const allowXffWithoutTrust = (process.env.ERL_ALLOW_XFF_WITHOUT_TRUST_PROXY || 'false').toLowerCase() === 'true';
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
    // Avoid throwing when X-Forwarded-For is present but trust proxy is not enabled
    // See ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
    // Cast to any for compatibility with different express-rate-limit typings
    validate: {
      // Disable only this specific validation when explicitly allowed by env
      xForwardedForHeader: allowXffWithoutTrust ? false : true
    } as any,
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

export const adminRateLimiter = createRateLimiter(
  5 * 60 * 1000, // 5 minutes
  isDevelopment ? 200 : 50 // Admin operations need higher limits
);

export const xffBypassMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const allowXffWithoutTrust = (process.env.ERL_ALLOW_XFF_WITHOUT_TRUST_PROXY || 'false').toLowerCase() === 'true';

  if (allowXffWithoutTrust && req.headers['x-forwarded-for']) {
    // Use Object.defineProperty to override the readonly ip property
    Object.defineProperty(req, 'ip', {
      value: (req.headers['x-forwarded-for'] as string).split(',')[0].trim(),
      writable: true,
      configurable: true
    });
  }

  next();
};
