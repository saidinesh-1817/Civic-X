import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/env.config.js';
import { corsOptions } from './config/cors.config.js';
import { requestLogger } from './middlewares/logging.middleware.js';
import { apiRateLimiter } from './middlewares/rateLimiter.middleware.js';
import { notFoundHandler, errorHandler } from './middlewares/error.middleware.js';
import { apiRouter } from './routes/index.js';

export const createApp = (): Express => {
  const app: Express = express();

  // Trust proxy for production environments behind reverse proxies/load balancers
  if (config.isProduction) {
    app.set('trust proxy', 1);
  }

  // Security HTTP headers
  app.use(helmet());

  // Cross-Origin Resource Sharing
  app.use(cors(corsOptions));

  // Request body parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // HTTP Request Logger
  app.use(requestLogger);

  // Root endpoint info
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      name: 'CivicSense API',
      version: '1.0.0',
      description: 'Civic Issue Reporting Platform Backend API',
      endpoints: {
        health: `${config.apiPrefix}/health`,
        v1: `${config.apiPrefix}/v1`,
      },
    });
  });

  // Apply rate limiter to API routes
  app.use(config.apiPrefix, apiRateLimiter);

  // Mount API routes
  app.use(config.apiPrefix, apiRouter);

  // Handle 404 Not Found
  app.use(notFoundHandler);

  // Global Error Handler
  app.use(errorHandler);

  return app;
};
