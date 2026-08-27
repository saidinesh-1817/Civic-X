import { Router } from 'express';
import { Role } from '@prisma/client';
import { authenticate, authRateLimiter, requireRole } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { AuthController } from './auth.controller.js';
import { citizenRegisterSchema, loginSchema, officerRegisterSchema } from './auth.schema.js';

export const authRouter = Router();

// -----------------------------------------------------------------------------
// Public Authentication Routes (with rate limiting & validation)
// -----------------------------------------------------------------------------

// Citizen Registration: POST /api/v1/auth/register
authRouter.post(
  '/register',
  authRateLimiter,
  validate({ body: citizenRegisterSchema }),
  AuthController.registerCitizen
);

// Alias: POST /api/v1/auth/register/citizen
authRouter.post(
  '/register/citizen',
  authRateLimiter,
  validate({ body: citizenRegisterSchema }),
  AuthController.registerCitizen
);

// Officer Registration: POST /api/v1/auth/register/officer
authRouter.post(
  '/register/officer',
  authRateLimiter,
  validate({ body: officerRegisterSchema }),
  AuthController.registerOfficer
);

// Alias: POST /api/v1/auth/officer/register
authRouter.post(
  '/officer/register',
  authRateLimiter,
  validate({ body: officerRegisterSchema }),
  AuthController.registerOfficer
);

// Universal Login: POST /api/v1/auth/login
authRouter.post(
  '/login',
  authRateLimiter,
  validate({ body: loginSchema }),
  AuthController.login
);

// -----------------------------------------------------------------------------
// Protected Authentication Routes (JWT required)
// -----------------------------------------------------------------------------

// Current Authenticated User: GET /api/v1/auth/me
authRouter.get('/me', authenticate, AuthController.getMe);

// Logout: POST /api/v1/auth/logout
authRouter.post('/logout', authenticate, AuthController.logout);

// -----------------------------------------------------------------------------
// Role-Protected Test / Diagnostic Routes (for automated RBAC verification)
// -----------------------------------------------------------------------------

// Citizen Only: GET /api/v1/auth/test/citizen-only
authRouter.get(
  '/test/citizen-only',
  authenticate,
  requireRole(Role.CITIZEN),
  AuthController.testRoleCheck
);

// Officer Only: GET /api/v1/auth/test/officer-only
authRouter.get(
  '/test/officer-only',
  authenticate,
  requireRole(Role.OFFICER),
  AuthController.testRoleCheck
);

// Admin Only: GET /api/v1/auth/test/admin-only
authRouter.get(
  '/test/admin-only',
  authenticate,
  requireRole(Role.ADMIN),
  AuthController.testRoleCheck
);
