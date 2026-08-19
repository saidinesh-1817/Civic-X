import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { config } from './env.config.js';

// Global singleton declaration to prevent multiple instances during hot-reloading
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__prisma ||
  new PrismaClient({
    log: config.isDevelopment
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'info' },
          { emit: 'event', level: 'warn' },
        ]
      : [
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ],
  });

if (config.isDevelopment) {
  global.__prisma = prisma;

  // Optional query logging in development mode
  // @ts-expect-error - $on query event is dynamically typed
  prisma.$on('query', (e: { query: string; duration: number }) => {
    // Only log non-internal query duration in debug mode if needed
    // logger.debug(`Query: ${e.query} (${e.duration}ms)`);
  });
}

// Attach error handler to logger
// @ts-expect-error - $on error event
prisma.$on('error', (e: { message: string }) => {
  logger.error('Prisma Database Error', e);
});

/**
 * Connect to PostgreSQL database and verify connection.
 */
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('Connected to PostgreSQL database successfully.');
  } catch (error) {
    logger.error('Failed to connect to PostgreSQL database:', error);
    throw error;
  }
}

/**
 * Disconnect cleanly from the database.
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Disconnected from PostgreSQL database.');
  } catch (error) {
    logger.error('Error disconnecting from PostgreSQL database:', error);
  }
}

/**
 * Check database connectivity health.
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database health check failed:', error);
    return false;
  }
}
