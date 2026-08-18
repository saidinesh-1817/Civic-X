import { Request, Response, NextFunction } from 'express';
import { ApiError, NotFoundError } from '../utils/apiError.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.config.js';

/**
 * Middleware to handle 404 Not Found for unmatched routes
 */
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
};

/**
 * Centralized global error handling middleware
 */
export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errors: unknown[] | undefined;
  let stack: string | undefined;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (err.name === 'SyntaxError' && 'body' in err) {
    // Malformed JSON in request body
    statusCode = 400;
    message = 'Invalid JSON in request payload';
  } else if (err.message) {
    message = err.message;
  }

  // Only expose stack trace in non-production environments
  if (!config.isProduction && err.stack) {
    stack = err.stack;
  }

  // Log non-operational or 5xx server errors
  if (statusCode >= 500) {
    logger.error(`[Unhandled Error] ${req.method} ${req.originalUrl}`, err, {
      body: req.body,
      params: req.params,
      query: req.query,
    });
  } else if (!config.isProduction) {
    logger.warn(`[Client Error ${statusCode}] ${req.method} ${req.originalUrl} - ${message}`);
  }

  ApiResponse.error(res, message, statusCode, errors, stack);
};
