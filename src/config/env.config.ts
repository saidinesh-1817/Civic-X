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

export const config: AppConfig = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isDevelopment: nodeEnv === 'development',
  isTest: nodeEnv === 'test',
  port: parseInt(process.env.PORT || '5000', 10),
  apiPrefix: process.env.API_PREFIX || '/api',
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/civicsense?schema=public',
  jwtSecret: process.env.JWT_SECRET || 'civicsense_jwt_secure_dev_secret_key_2026_!@#987',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  adminEmail: process.env.ADMIN_EMAIL || 'demo.admin@civicsense.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'AdminSecure123!',
  rateLimit: {
    windowMinutes: parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || '15', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    authMaxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '30', 10),
  },
};
