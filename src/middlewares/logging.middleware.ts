import morgan from 'morgan';
import { Request, Response } from 'express';
import { config } from '../config/env.config.js';

// Custom morgan token for response time in ms
morgan.token('colored-status', (_req: Request, res: Response) => {
  const status = res.statusCode;
  if (status >= 500) {
    return `\x1b[31m${status}\x1b[0m`; // Red
  }
  if (status >= 400) {
    return `\x1b[33m${status}\x1b[0m`; // Yellow
  }
  if (status >= 300) {
    return `\x1b[36m${status}\x1b[0m`; // Cyan
  }
  return `\x1b[32m${status}\x1b[0m`; // Green
});

// Development log format
const devFormat = ':method :url :colored-status - :response-time ms';

// Production log format (standard Apache/Combined style or structured)
const prodFormat = '[:date[iso]] :remote-addr ":method :url HTTP/:http-version" :status :res[content-length] - :response-time ms';

export const requestLogger = morgan(config.isProduction ? prodFormat : devFormat, {
  skip: (req: Request) => {
    // Optionally skip health check endpoint spam in production if desired
    return config.isProduction && req.url === '/api/health';
  },
});
