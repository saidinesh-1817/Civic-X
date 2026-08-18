import { Server } from 'http';
import { createApp } from './app.js';
import { config } from './config/env.config.js';
import { logger } from './utils/logger.js';

// Catch synchronous uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception occurred! Shutting down immediately...', error);
  process.exit(1);
});

const app = createApp();

const server: Server = app.listen(config.port, () => {
  logger.info(`================================================`);
  logger.info(`CivicSense API Server is running`);
  logger.info(`Environment : ${config.nodeEnv}`);
  logger.info(`Port        : ${config.port}`);
  logger.info(`Health Check: http://localhost:${config.port}${config.apiPrefix}/health`);
  logger.info(`================================================`);
});

// Graceful shutdown handler
const handleGracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  server.close((err) => {
    if (err) {
      logger.error('Error during server shutdown', err);
      process.exit(1);
    }
    logger.info('HTTP server closed successfully. Process terminating.');
    process.exit(0);
  });

  // Force close after 10 seconds if hanging
  setTimeout(() => {
    logger.error('Forceful shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

// Catch asynchronous unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Promise Rejection detected', reason);
  server.close(() => {
    process.exit(1);
  });
});
