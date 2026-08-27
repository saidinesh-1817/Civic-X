import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { Role, VerificationStatus } from '@prisma/client';
import { prisma } from '../config/database.js';
import { config } from '../config/env.config.js';
import { AuthService, SafeUser } from '../modules/auth/auth.service.js';
import { ForbiddenError, UnauthorizedError } from '../utils/apiError.js';

// Augment Express Request interface with authenticated user property
declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
    }
  }
}

/**
 * Authentication Middleware: Verifies JWT token and attaches authenticated user to Request
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication token is missing or invalid');
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedError('Authentication token is missing');
    }

    // Verify JWT payload
    const decoded = AuthService.verifyToken(token);

    // Retrieve fresh user record from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        officer_profile: {
          include: {
            department: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('User account associated with this token no longer exists');
    }

    // Disallow blocked users from any authenticated operations
    if (user.is_blocked) {
      throw new ForbiddenError(
        'Your account has been blocked by administration. Access to the platform is suspended.'
      );
    }

    // Disallow pending/rejected officers from authenticated operations
    if (user.role === Role.OFFICER) {
      if (!user.officer_profile) {
        throw new ForbiddenError('Officer profile not found');
      }

      if (user.officer_profile.verification_status !== VerificationStatus.APPROVED) {
        throw new ForbiddenError(
          `Officer account is currently ${user.officer_profile.verification_status}. Access to protected resources is restricted.`
        );
      }
    }

    req.user = AuthService.sanitizeUser(user);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Role-Based Access Control (RBAC) Middleware Factory
 * Checks if the authenticated user has one of the allowed roles
 */
export const requireRole = (...allowedRoles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (req.user.is_blocked) {
      return next(
        new ForbiddenError(
          'Your account has been blocked by administration. Access to the platform is suspended.'
        )
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Access denied. Role "${req.user.role}" is not authorized for this resource. Required: [${allowedRoles.join(
            ', '
          )}]`
        )
      );
    }

    // Additional safeguard for Officer verification
    if (
      req.user.role === Role.OFFICER &&
      req.user.officer_profile?.verification_status !== VerificationStatus.APPROVED
    ) {
      return next(
        new ForbiddenError('Officer account must be approved before accessing this resource.')
      );
    }

    next();
  };
};

/**
 * Dedicated Rate Limiter for Authentication Endpoints
 * Guards against brute-force and credential stuffing attacks
 */
export const authRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMinutes * 60 * 1000,
  max: config.rateLimit.authMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: `Too many authentication attempts from this IP, please try again after ${config.rateLimit.windowMinutes} minutes`,
  },
});

// Re-export authorization middlewares from authorization.middleware.ts for unified access
export {
  requireAuthentication,
  requireRoles,
  requireCitizen,
  requireOfficer,
  requireApprovedOfficer,
  requireAdmin,
  requireDepartmentAccess,
  requireResourceOwner,
  type DepartmentIdResolver,
  type OwnerIdResolver,
} from './authorization.middleware.js';
