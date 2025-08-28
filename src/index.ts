import { createApp } from './app';
import { container } from './container';
import { MonitorContractsUseCase } from './application/useCases/MonitorContractsUseCase';
import { MongoDBConnection } from './infrastructure/database/MongoDBConnection';
import { EthereumService } from './infrastructure/blockchain/EthereumService';
import { GracefulShutdown } from './infrastructure/GracefulShutdown';
import { logger } from './infrastructure/logging/Logger';
import { validateWithGracefulDegradation, getEnvDefaults, isRailwayEnvironment, getEnvVar } from './config/validateEnv';
import { readinessTracker } from './infrastructure/readiness/ReadinessTracker';

// Validate environment before starting
const envResult = validateWithGracefulDegradation();
if (envResult.isValid) {
  readinessTracker.markReady('environment');
} else {
  readinessTracker.markNotReady('environment', `${envResult.errors.length} validation errors`);
}

const envDefaults = getEnvDefaults();
const PORT = envDefaults.PORT;
const MONITORING_INTERVAL = envDefaults.MONITORING_INTERVAL;

let monitoringIntervalId: NodeJS.Timeout | null = null;
let server: any = null;

async function startServer() {
  try {
    logger.info('Starting Agora Backend Server...', {
      version: require('../package.json').version || '1.0.0',
      nodeVersion: process.version,
      environment: envDefaults.NODE_ENV
    });
    // Initialize MongoDB connection if enabled
    if (envDefaults.USE_MONGODB) {
      logger.info('Connecting to MongoDB...');
      try {
        const mongoConnection = container.get<MongoDBConnection>('MongoDBConnection');
        await mongoConnection.connect();
        logger.info('MongoDB connected successfully');
        readinessTracker.markReady('mongodb');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('MongoDB connection failed', { error: errorMessage });
        readinessTracker.markNotReady('mongodb', errorMessage);
        throw new Error(`MongoDB connection failed: ${errorMessage}`);
      }
    } else {
      logger.info('MongoDB disabled - running without database');
      readinessTracker.markReady('mongodb'); // Mark as ready since it's not required
    }

    const app = createApp();
    readinessTracker.markReady('app');

    // Start server with promise-based approach for better error handling
    server = await new Promise((resolve, reject) => {
      const serverInstance = app.listen(PORT, (error?: Error) => {
        if (error) {
          readinessTracker.markNotReady('server', error.message);
          reject(error);
        } else {
          logger.info(`🚀 Agora Oracle Server running on port ${PORT}`, {
            environment: envDefaults.NODE_ENV,
            mongodb: envDefaults.USE_MONGODB ? 'enabled' : 'disabled',
            monitoring: `${MONITORING_INTERVAL}ms intervals`,
            healthCheck: '/health'
          });
          readinessTracker.markReady('server');
          resolve(serverInstance);
        }
      });
      
      // Handle server errors
      serverInstance.on('error', (error) => {
        logger.error('Server error', { error: error.message });
        readinessTracker.markNotReady('server', error.message);
        reject(error);
      });
    });

    // Setup graceful shutdown
    const gracefulShutdown = new GracefulShutdown(server);
    
    // Register cleanup callbacks
    gracefulShutdown.registerShutdownCallback(async () => {
      logger.info('Stopping contract monitoring...');
      if (monitoringIntervalId) {
        clearInterval(monitoringIntervalId);
      }
    });

    gracefulShutdown.registerShutdownCallback(async () => {
      logger.info('Cleaning up Ethereum service...');
      const ethereumService = container.get<EthereumService>('IBlockchainService');
      if (ethereumService.cleanup) {
        ethereumService.cleanup();
      }
    });

    gracefulShutdown.registerShutdownCallback(async () => {
      if (envDefaults.USE_MONGODB) {
        logger.info('Disconnecting from MongoDB...');
        try {
          const mongoConnection = container.get<MongoDBConnection>('MongoDBConnection');
          await mongoConnection.disconnect();
          logger.info('MongoDB disconnected successfully');
        } catch (error) {
          logger.error('MongoDB disconnect error', { 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }
    });

    // Start contract monitoring conditionally
    if (envDefaults.HAS_BLOCKCHAIN_CONFIG) {
      try {
        startContractMonitoring();
        logger.info('Contract monitoring started successfully');
        readinessTracker.markReady('monitoring');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.warn('Contract monitoring failed but continuing in degraded mode', { error: errorMessage });
        readinessTracker.markReady('monitoring'); // Mark ready but degraded
      }
    } else {
      logger.info('Contract monitoring disabled - blockchain configuration missing');
      logger.info('Required: ETHEREUM_RPC_URL and (ORACLE_CONTRACT_ADDRESS or MAIN_CONTRACT_ADDRESS)');
      readinessTracker.markReady('monitoring'); // Ready without monitoring
    }
    
  } catch (error) {
    logger.error('Failed to start server', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Cleanup on startup failure
    if (server) {
      server.close();
    }
    
    process.exit(1);
  }
}

function startContractMonitoring() {
  const monitorUseCase = container.get<MonitorContractsUseCase>('MonitorContractsUseCase');
  
  // Log Railway environment configuration
  if (isRailwayEnvironment()) {
    logger.info('🚂 Railway environment detected');
    logger.info('Contract monitoring configuration:', {
      contractAddress: getEnvVar(['MAIN_CONTRACT_ADDRESS', 'ORACLE_CONTRACT_ADDRESS']) ? '✅ Set' : '❌ Missing',
      rpcUrl: process.env.ETHEREUM_RPC_URL ? '✅ Set' : '❌ Missing',
      useRealBlockchain: process.env.USE_REAL_BLOCKCHAIN === 'true' ? '✅ Enabled' : '⚠️ Disabled (mock mode)',
      pollingInterval: process.env.ETHEREUM_POLLING_INTERVAL || 10000,
      monitoringInterval: MONITORING_INTERVAL
    });
  }

  logger.info(`Starting contract monitoring with interval: ${MONITORING_INTERVAL}ms`);

  monitoringIntervalId = setInterval(async () => {
    try {
      await monitorUseCase.execute();
    } catch (error) {
      logger.error('Monitoring error', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }, MONITORING_INTERVAL);

  // Execute once immediately
  monitorUseCase.execute().catch(error => 
    logger.error('Initial monitoring execution failed', { error: error.message })
  );
}

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  // Don't exit for filter-related errors since we use queryFilter polling
  if (reason && typeof reason === 'object' && 'message' in reason) {
    const errorMessage = (reason as any).message || '';
    if (errorMessage.includes('filter not found') || errorMessage.includes('could not coalesce error')) {
      logger.info('Ignoring filter-related unhandled rejection (using queryFilter polling)', {
        reason: errorMessage
      });
      return; // Don't exit the process
    }
  }
  
  logger.error('Unhandled Rejection at:', { promise, reason });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { 
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Start the server
startServer().catch(error => {
  logger.error('Server startup failed', { 
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});