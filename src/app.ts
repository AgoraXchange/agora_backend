import express from 'express';
import helmet from 'helmet';
import cors, { CorsOptions } from 'cors';
import dotenv from 'dotenv';
import { createOracleRoutes } from './interfaces/routes/oracleRoutes';
import { createAuthRoutes } from './interfaces/routes/authRoutes';
import { createDeliberationRoutes } from './interfaces/routes/deliberationRoutes';
import { errorHandler, notFoundHandler } from './interfaces/middleware/errorMiddleware';
import { apiRateLimiter } from './interfaces/middleware/rateLimitMiddleware';
import { logger } from './infrastructure/logging/Logger';

dotenv.config();

export function createApp() {
  const app = express();

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

  const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
      // Allow same-origin/non-browser requests
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      // Lenient localhost in non-production
      if ((process.env.NODE_ENV || 'development') !== 'production') {
        const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\\d+)?$/.test(origin);
        if (isLocalhost) return callback(null, true);
      }

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

  // Body parser middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
