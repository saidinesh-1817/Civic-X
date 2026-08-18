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
  rateLimit: {
    windowMinutes: number;
    maxRequests: number;
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
  rateLimit: {
    windowMinutes: parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || '15', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
};
