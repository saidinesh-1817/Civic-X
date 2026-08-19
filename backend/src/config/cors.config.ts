import { CorsOptions } from 'cors';
import { config } from './env.config.js';

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin) {
      return callback(null, true);
    }

    if (config.corsOrigin === '*') {
      return callback(null, true);
    }

    const allowedOrigins = Array.isArray(config.corsOrigin)
      ? config.corsOrigin
      : [config.corsOrigin];

    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }

    return callback(new Error(`Origin ${origin} is not allowed by CORS policy.`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Api-Key',
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  credentials: true,
  maxAge: 86400, // 24 hours preflight cache
};
