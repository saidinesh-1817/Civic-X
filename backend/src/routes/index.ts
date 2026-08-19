import { Router } from 'express';
import { healthRouter } from './v1/health.route.js';
import { v1Router } from './v1/index.js';

export const apiRouter = Router();

// Root API Health Endpoint: GET /api/health
apiRouter.use('/', healthRouter);

// Versioned API v1 Routes: /api/v1/...
apiRouter.use('/v1', v1Router);
