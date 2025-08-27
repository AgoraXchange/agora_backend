import { Server } from 'http';
import { logger } from './logging/Logger';

export class GracefulShutdown {
  private shutdownCallbacks: Array<() => Promise<void>> = [];
  private isShuttingDown = false;

  constructor(private server: Server) {
    this.setupSignalHandlers();
  }

  private setupSignalHandlers(): void {
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
      this.shutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', { reason, promise });
      this.shutdown('unhandledRejection');
    });
  }

  public registerShutdownCallback(callback: () => Promise<void>): void {
    this.shutdownCallbacks.push(callback);
  }

  private async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      logger.info('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown`);

    const shutdownTimeout = setTimeout(() => {
      logger.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, 30000);

    try {
      logger.info('Closing HTTP server');
      await new Promise<void>((resolve, reject) => {
        this.server.close((err) => {
          if (err) {
            logger.error('Error closing server', { error: err.message });
            reject(err);
          } else {
            logger.info('HTTP server closed');
            resolve();
          }
        });
      });

      logger.info('Running shutdown callbacks');
      await Promise.all(
        this.shutdownCallbacks.map(callback => 
          callback().catch(err => 
            logger.error('Shutdown callback error', { error: err.message })
          )
        )
      );

      clearTimeout(shutdownTimeout);
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  }
}