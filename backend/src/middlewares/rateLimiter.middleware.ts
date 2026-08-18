import rateLimit from 'express-rate-limit';
import { config } from '../config/env.config.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const apiRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMinutes * 60 * 1000,
  max: config.rateLimit.maxRequests,
  standardHeaders: true, // Return standard RateLimit headers (draft-6 / draft-7)
  legacyHeaders: false, // Disable X-RateLimit-* legacy headers
  handler: (_req, res) => {
    ApiResponse.error(
      res,
      'Too many requests from this IP, please try again later.',
      429
    );
  },
  skip: (req) => {
    // Optionally skip rate limiting for health check
    return req.path === '/health' || req.path === '/api/health';
  },
});
