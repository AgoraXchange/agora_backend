import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import { createOracleRoutes } from './interfaces/routes/oracleRoutes';
import { createAuthRoutes } from './interfaces/routes/authRoutes';
import { createDeliberationRoutes } from './interfaces/routes/deliberationRoutes';
import { errorHandler, notFoundHandler } from './interfaces/middleware/errorMiddleware';
import { apiRateLimiter } from './interfaces/middleware/rateLimitMiddleware';
import { logger } from './infrastructure/logging/Logger';
import { container } from './container';
import { MongoDBConnection } from './infrastructure/database/MongoDBConnection';
import { readinessTracker } from './infrastructure/readiness/ReadinessTracker';

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

  // Enhanced health check route with readiness tracking
  app.get('/health', async (req, res) => {
    const startTime = Date.now();
    const readinessStatus = readinessTracker.getReadinessStatus();
    const isReady = readinessStatus.overall;
    
    const healthStatus: any = {
      status: isReady ? 'ready' : 'starting',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      version: require('../package.json').version || '1.0.0',
      readiness: {
        ready: isReady,
        components: readinessStatus.components,
        notReadyComponents: readinessTracker.getNotReadyComponents()
      },
      services: {}
    };

    try {
      // Check MongoDB connection if enabled
      if (process.env.USE_MONGODB === 'true') {
        try {
          const mongoConnection = container.get<MongoDBConnection>('MongoDBConnection');
          // Try a simple ping operation
          await mongoConnection.getDb().admin().ping();
          healthStatus.services.mongodb = { status: 'healthy', connection: 'active' };
        } catch (error) {
          healthStatus.status = 'degraded';
          healthStatus.services.mongodb = { 
            status: 'unhealthy', 
            error: error instanceof Error ? error.message : 'Unknown error' 
          };
        }
      } else {
        healthStatus.services.mongodb = { status: 'disabled' };
      }

      // Check if container dependency is available (cached after first check)
      if (!app.locals.blockchainServiceStatus) {
        try {
          container.get('IBlockchainService');
          app.locals.blockchainServiceStatus = { status: 'available', checkedAt: Date.now() };
        } catch (error) {
          app.locals.blockchainServiceStatus = { status: 'unavailable', error: error instanceof Error ? error.message : 'Unknown error', checkedAt: Date.now() };
        }
      }
      
      healthStatus.services.blockchain = { 
        status: app.locals.blockchainServiceStatus.status,
        lastChecked: new Date(app.locals.blockchainServiceStatus.checkedAt).toISOString()
      };
      
      if (app.locals.blockchainServiceStatus.status === 'unavailable') {
        if (healthStatus.status !== 'degraded') {
          healthStatus.status = 'degraded';
        }
      }

      // Add response time
      healthStatus.responseTime = `${Date.now() - startTime}ms`;

      // Set appropriate HTTP status based on readiness and health
      // Railway needs 200 OK for degraded mode to pass health checks
      let httpStatus = 200; // Always return 200 for Railway compatibility
      
      // Only return 503 if there are actual service failures (not just env validation)
      const hasServiceFailures = healthStatus.services.mongodb?.status === 'unhealthy' || 
                                 healthStatus.services.blockchain?.status === 'unavailable';
      
      if (hasServiceFailures) {
        httpStatus = 503; // Service Unavailable - actual service failures
      }
      
      res.status(httpStatus).json(healthStatus);
    } catch (error) {
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Health check failed',
        responseTime: `${Date.now() - startTime}ms`,
        readiness: {
          ready: false,
          components: readinessStatus.components,
          notReadyComponents: readinessTracker.getNotReadyComponents()
        }
      });
    }
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