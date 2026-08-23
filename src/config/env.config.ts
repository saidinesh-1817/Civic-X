import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  port: number;
  apiPrefix: string;
  corsOrigin: string | string[];
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  adminEmail: string;
  adminPassword: string;
  rateLimit: {
    windowMinutes: number;
    maxRequests: number;
    authMaxRequests: number;
  };
}

const parseCorsOrigin = (originValue?: string): string | string[] => {
  if (!originValue || originValue.trim() === '*') {
    return '*';
  }
  const origins = originValue.split(',').map((origin) => origin.trim()).filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
};

const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';

const jwtSecret = process.env.JWT_SECRET;
const databaseUrl = process.env.DATABASE_URL;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

if (nodeEnv === 'production') {
  const missing: string[] = [];
  if (!jwtSecret) missing.push('JWT_SECRET');
  if (!databaseUrl) missing.push('DATABASE_URL');
  if (!adminEmail) missing.push('ADMIN_EMAIL');
  if (!adminPassword) missing.push('ADMIN_PASSWORD');
  if (missing.length > 0) {
    throw new Error(`Required production environment variables are missing: ${missing.join(', ')}`);
  }
}

export const config: AppConfig = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isDevelopment: nodeEnv === 'development',
  isTest: nodeEnv === 'test',
  port: parseInt(process.env.PORT || '5000', 10),
  apiPrefix: process.env.API_PREFIX || '/api',
  corsOrigin: parseCorsOrigin(process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173'),
  databaseUrl: databaseUrl || 'postgresql://postgres:postgres@localhost:5432/civicsense?schema=public',
  // Development/test fallback is intentionally non-production only.
  jwtSecret: jwtSecret || 'civicsense_dev_only_jwt_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  adminEmail: adminEmail || 'demo.admin@civicsense.local',
  adminPassword: adminPassword || 'AdminSecure123!',
  rateLimit: {
    windowMinutes: parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || '15', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    authMaxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '30', 10),
  },
};
