import express from 'express';
import helmet from 'helmet';
import cors, { CorsOptions } from 'cors';
import dotenv from 'dotenv';
import { createOracleRoutes } from './interfaces/routes/oracleRoutes';
import { createAuthRoutes } from './interfaces/routes/authRoutes';
import { createDeliberationRoutes } from './interfaces/routes/deliberationRoutes';
import { errorHandler, notFoundHandler } from './interfaces/middleware/errorMiddleware';
import { apiRateLimiter, xffBypassMiddleware } from './interfaces/middleware/rateLimitMiddleware';
import { logger } from './infrastructure/logging/Logger';

dotenv.config();

export function createApp() {
  const app = express();
  
  // Trust proxy configuration (for correct client IPs behind load balancers)
  // TRUST_PROXY can be: number (hops), 'true'/'false', or subnet list
  const trustProxyEnv = process.env.TRUST_PROXY;
  if (typeof trustProxyEnv !== 'undefined') {
    const lower = trustProxyEnv.toLowerCase();
    if (lower === 'true' || lower === 'false') {
      app.set('trust proxy', lower === 'true');
    } else if (!isNaN(Number(trustProxyEnv))) {
      app.set('trust proxy', Number(trustProxyEnv));
    } else {
      // Allow passing subnet/CSV per Express semantics
      app.set('trust proxy', trustProxyEnv);
    }
    logger.info('Express trust proxy configured', { value: trustProxyEnv });
  }

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }));

  // CORS configuration (robust origin parsing + flexible headers)
  const defaultDevOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174'
  ];
  const rawOrigins = process.env.ALLOWED_ORIGINS || '';
  const envOrigins = rawOrigins
    .split(',')
    .map(o => o.trim())
    .filter(o => o.length > 0);
  const allowedOrigins = envOrigins.length > 0 ? envOrigins : defaultDevOrigins;

  const originPatterns = (process.env.ALLOWED_ORIGINS_REGEX || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      try {
        return new RegExp(s);
      } catch {
        logger.warn('Invalid ALLOWED_ORIGINS_REGEX pattern ignored', { pattern: s });
        return null;
      }
    })
    .filter((r): r is RegExp => !!r);

  const wildcardToRegex = (pattern: string): RegExp => {
    // Escape regex meta except '*', then convert '*' to '.*'
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp('^' + escaped.replace(/\/$/, '') + '$');
  };

  const isOriginAllowed = (origin: string): boolean => {
    const clean = origin.replace(/\/$/, '');
    if (allowedOrigins.some(o => o.replace(/\/$/, '') === clean)) return true;
    // wildcard support like https://*.example.com
    for (const o of allowedOrigins) {
      if (o.includes('*')) {
        const re = wildcardToRegex(o);
        if (re.test(clean)) return true;
      }
    }
    if (originPatterns.some(re => re.test(clean))) return true;
    return false;
  };

  const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
      // Allow same-origin/non-browser requests
      if (!origin) return callback(null, true);

      const allowed = isOriginAllowed(origin);
      if (process.env.CORS_DEBUG === 'true') {
        logger.info('CORS origin check', { origin, allowed });
      }
      if (allowed) return callback(null, true);

      // Lenient localhost in non-production
      if ((process.env.NODE_ENV || 'development') !== 'production') {
        const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\\d+)?$/.test(origin);
        if (isLocalhost) return callback(null, true);
      }

      logger.warn('CORS blocked origin', { origin });
      callback(new Error(`CORS: Origin not allowed: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // Let cors reflect requested headers automatically by not fixing allowedHeaders
    exposedHeaders: ['Content-Length', 'X-Request-ID'],
    maxAge: 86400
  };

  app.use(cors(corsOptions));
  // Ensure preflight requests are handled
  app.options('*', cors(corsOptions));

  // Extra-fast preflight handler (belt-and-suspenders) before any heavy middleware
  app.use((req, res, next) => {
    if (req.method !== 'OPTIONS') return next();
    const origin = req.headers.origin as string | undefined;
    if (!origin) return res.sendStatus(204);
    const allowed = isOriginAllowed(origin) || ((process.env.NODE_ENV || 'development') !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\\d+)?$/.test(origin));
    if (process.env.CORS_DEBUG === 'true') {
      logger.info('Fast preflight', { origin, allowed });
    }
    if (!allowed) return res.status(403).send('CORS preflight blocked');
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    const reqHeaders = (req.headers['access-control-request-headers'] as string | undefined) || 'Content-Type, Authorization, Accept, Origin, X-Requested-With';
    res.setHeader('Access-Control-Allow-Headers', reqHeaders);
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.sendStatus(204);
  });

  // Body parser middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Pre-process X-Forwarded-For if trust proxy is disabled to avoid express-rate-limit validation errors
  app.use(xffBypassMiddleware);

  // Global rate limiting
  app.use(apiRateLimiter);

  // Request logging
  app.use((req, res, next) => {
    logger.info('Incoming request', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    next();
  });

  // Health check route
  app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'agora-oracle', path: '/' });
  });

  app.head('/', (_req, res) => res.sendStatus(200));
  app.head('/health', (_req, res) => res.sendStatus(200));

  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  });

  // API routes
  app.use('/api/auth', createAuthRoutes());
  app.use('/api/oracle', createOracleRoutes());
  app.use('/api/deliberations', createDeliberationRoutes());

  // 404 handler
  app.use(notFoundHandler);

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}
