/* eslint-disable no-console */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const formatMessage = (level: LogLevel, message: string, context?: Record<string, unknown>): string => {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` | context: ${JSON.stringify(context)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}]: ${message}${contextStr}`;
};

export const logger = {
  info: (message: string, context?: Record<string, unknown>): void => {
    console.log(`\x1b[36m${formatMessage('info', message, context)}\x1b[0m`);
  },

  warn: (message: string, context?: Record<string, unknown>): void => {
    console.warn(`\x1b[33m${formatMessage('warn', message, context)}\x1b[0m`);
  },

  error: (message: string, error?: unknown, context?: Record<string, unknown>): void => {
    const errorDetails = error instanceof Error ? { message: error.message, stack: error.stack } : error;
    const combinedContext = { ...(context || {}), ...(errorDetails ? { error: errorDetails } : {}) };
    console.error(`\x1b[31m${formatMessage('error', message, combinedContext)}\x1b[0m`);
  },

  debug: (message: string, context?: Record<string, unknown>): void => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`\x1b[35m${formatMessage('debug', message, context)}\x1b[0m`);
    }
  },
};
