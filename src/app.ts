import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { createOracleRoutes } from './interfaces/routes/oracleRoutes';
import { createAuthRoutes } from './interfaces/routes/authRoutes';
import { createDeliberationRoutes } from './interfaces/routes/deliberationRoutes';
import { createDiagnosticsRoutes } from './interfaces/routes/diagnosticsRoutes';
import { errorHandler, notFoundHandler } from './interfaces/middleware/errorMiddleware';
import { apiRateLimiter } from './interfaces/middleware/rateLimitMiddleware';
import { logger } from './infrastructure/logging/Logger';

dotenv.config();

// Pre-load package.json version to avoid require() during health check
let packageVersion: string = '1.0.0';
try {
  packageVersion = require('../package.json').version || '1.0.0';
} catch (error) {
  logger.warn('Failed to load package.json version, using default', { error: error instanceof Error ? error.message : 'Unknown error' });
}

export function createApp() {
  const app = express();

  // Behind Railway/other proxies, enable trust proxy so req.ip and rate-limit work with X-Forwarded-For
  // Must be set before any middleware that relies on client IP (e.g., rate limiters)
  app.set('trust proxy', 1);

  // Health check FIRST - before any middleware to ensure fast Railway response
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      version: packageVersion
    });
  });

  // Some platforms use HEAD for healthchecks
  app.head('/health', (req, res) => {
    res.status(200).end();
  });

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

  // CORS configuration
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:5173', // Vite frontend default
      'http://localhost:5174', // Vite frontend alternative port
      'http://127.0.0.1:5173', // Alternative localhost
      'http://127.0.0.1:5174'  // Alternative localhost with alt port
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Length', 'X-Request-ID'],
    maxAge: 86400, // 24 hours preflight cache
  }));

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

  // Root route (basic sanity/uptime check)
  app.get('/', (_req, res) => {
    res.status(200).send('OK');
  });

  // Some environments issue HEAD on root as healthcheck
  app.head('/', (_req, res) => {
    res.status(200).end();
  });

  // API routes
  app.use('/api/auth', createAuthRoutes());
  app.use('/api/oracle', createOracleRoutes());
  app.use('/api/deliberations', createDeliberationRoutes());
  app.use('/api/diagnostics', createDiagnosticsRoutes());

  // 404 handler
  app.use(notFoundHandler);

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}
