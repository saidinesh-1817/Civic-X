import { Router, Request, Response } from 'express';

export const healthRouter = Router();

/**
 * @route GET /api/health or /api/v1/health
 * @desc System health check endpoint
 */
healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'CivicSense API',
    timestamp: new Date().toISOString(),
  });
});
