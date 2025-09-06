import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
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
    skip: (req: Request) => {
      // Never rate-limit health checks or CORS preflight
      if (req.method === 'OPTIONS') return true;
      if (req.path === '/health' || req.path === '/') return true;
      return false;
    },
    // Prefer real client IP from sanitized XFF (if present), otherwise fall back to req.ip
    keyGenerator: (req: Request) => {
      const realIp = (req as any).realIpFromXff
        || (req.headers['cf-connecting-ip'] as string | undefined)
        || (req.headers['x-real-ip'] as string | undefined);
      return realIp || req.ip;
    },
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

// Middleware to safely consume X-Forwarded-For without requiring Express trust proxy
// If trust proxy is disabled and XFF is present, capture the first IP, store it, and remove the header
// This prevents express-rate-limit v7 from throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
export function xffBypassMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const trustSetting = req.app.get('trust proxy');
    const trustEnabled = Boolean(trustSetting);
    const allowBypass = process.env.ERL_ALLOW_XFF_WITHOUT_TRUST_PROXY === 'true';
    const xff = req.headers['x-forwarded-for'];
    if (!trustEnabled && xff && allowBypass) {
      const header = Array.isArray(xff) ? xff[0] : String(xff);
      const firstIp = header.split(',')[0].trim();
      (req as any).realIpFromXff = firstIp;
      delete req.headers['x-forwarded-for'];
    }
  } catch {}
  next();
}
