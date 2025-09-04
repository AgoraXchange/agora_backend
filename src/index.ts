import { createApp } from './app';
import { container } from './container';
import { MonitorContractsUseCase } from './application/useCases/MonitorContractsUseCase';
import { MongoDBConnection } from './infrastructure/database/MongoDBConnection';
import { EthereumService } from './infrastructure/blockchain/EthereumService';
import { GracefulShutdown } from './infrastructure/GracefulShutdown';
import { logger } from './infrastructure/logging/Logger';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const MONITORING_INTERVAL = parseInt(process.env.MONITORING_INTERVAL || '60000');

let monitoringIntervalId: NodeJS.Timeout | null = null;

async function startServer() {
  try {
    // Initialize MongoDB connection if enabled
    if (process.env.USE_MONGODB === 'true') {
      logger.info('Connecting to MongoDB...');
      const mongoConnection = container.get<MongoDBConnection>('MongoDBConnection');
      await mongoConnection.connect();
    }

    const app = createApp();

    const server = app.listen(PORT, HOST, () => {
      logger.info(`Oracle server running on port ${PORT}`, {
        host: HOST,
        environment: process.env.NODE_ENV || 'development',
        mongodb: process.env.USE_MONGODB === 'true' ? 'enabled' : 'disabled'
      });
    });

    // Tune timeouts for common LBs (avoid abrupt disconnects)
    // @ts-ignore: Node types vary across versions
    server.keepAliveTimeout = 55000; // 55s (< typical 60s LB idle)
    // @ts-ignore
    server.headersTimeout = 60000;   // keepAlive + 5s safety
    // @ts-ignore
    server.requestTimeout = 30000;   // 30s

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
      if (process.env.USE_MONGODB === 'true') {
        logger.info('Disconnecting from MongoDB...');
        const mongoConnection = container.get<MongoDBConnection>('MongoDBConnection');
        await mongoConnection.disconnect();
      }
    });

    // Start contract monitoring
    startContractMonitoring();
  } catch (error) {
    logger.error('Failed to start server', { error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
}

function startContractMonitoring() {
  const monitorUseCase = container.get<MonitorContractsUseCase>('MonitorContractsUseCase');

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

startServer().catch(error => {
  logger.error('Server startup failed', { error: error.message });
  process.exit(1);
});
