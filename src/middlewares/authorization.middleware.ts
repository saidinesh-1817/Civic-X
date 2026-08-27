import { NextFunction, Request, Response } from 'express';
import { Role, VerificationStatus } from '@prisma/client';
import { authenticate } from './auth.middleware.js';
import { ForbiddenError, UnauthorizedError, BadRequestError } from '../utils/apiError.js';
import { checkDepartmentAccess, checkResourceOwner } from '../utils/authHelpers.js';

export type DepartmentIdResolver =
  | string
  | ((req: Request) => string | undefined | null | Promise<string | undefined | null>);

export type OwnerIdResolver =
  | string
  | ((req: Request) => string | undefined | null | Promise<string | undefined | null>);

/**
 * Authentication assertion middleware:
 * Ensures the request is authenticated. If not already authenticated by upstream middleware,
 * executes JWT authentication pipeline.
 */
export const requireAuthentication = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (req.user) {
    return next();
  }
  return authenticate(req, res, next);
};

/**
 * Role-Based Access Control (RBAC) middleware factory.
 * Verifies that the authenticated user possesses one of the allowed roles.
 * Also strictly validates that any officer has an APPROVED verification status.
 *
 * @param allowedRoles List of roles permitted to access the route
 */
export const requireRoles = (...allowedRoles: Role[]) => {
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

    // Additional safeguard for Field Officers
    if (req.user.role === Role.OFFICER) {
      if (!req.user.officer_profile) {
        return next(new ForbiddenError('Officer profile not found.'));
      }

      if (req.user.officer_profile.verification_status !== VerificationStatus.APPROVED) {
        return next(
          new ForbiddenError(
            `Officer account is currently ${req.user.officer_profile.verification_status}. Access requires an APPROVED account.`
          )
        );
      }
    }

    next();
  };
};

/**
 * Middleware: Restricts access strictly to authenticated Citizens.
 */
export const requireCitizen = requireRoles(Role.CITIZEN);

/**
 * Middleware: Restricts access strictly to authenticated & approved Field Officers.
 */
export const requireOfficer = requireRoles(Role.OFFICER);

/**
 * Middleware: Explicit alias for requiring an approved field officer.
 */
export const requireApprovedOfficer = requireRoles(Role.OFFICER);

/**
 * Middleware: Restricts access strictly to Platform Administrators.
 */
export const requireAdmin = requireRoles(Role.ADMIN);

/**
 * Department Access Control Middleware Factory:
 * Enforces department boundaries for officer resources.
 * 
 * - Sourced strictly from the database profile attached to req.user.
 * - ADMIN: Granted cross-department administrative access.
 * - OFFICER (APPROVED): Granted access ONLY when their assigned department matches the target department.
 * - CITIZEN / Others: Denied (403 Forbidden).
 * 
 * @param departmentResolver Static department ID string or dynamic extractor function
 */
export const requireDepartmentAccess = (departmentResolver?: DepartmentIdResolver) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      // Resolve the target department ID
      let targetDeptId: string | undefined | null;

      if (typeof departmentResolver === 'function') {
        targetDeptId = await departmentResolver(req);
      } else if (typeof departmentResolver === 'string') {
        targetDeptId = departmentResolver;
      } else {
        // Default extraction fallback: req.params.departmentId -> req.params.id -> req.body.department_id -> req.query.departmentId
        targetDeptId =
          req.params.departmentId ||
          req.params.id ||
          (req.body && req.body.department_id) ||
          (typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined);
      }

      if (!targetDeptId) {
        return next(new BadRequestError('Department ID is required to evaluate department access'));
      }

      // Check access using server-side authenticated identity
      const isAllowed = checkDepartmentAccess(req.user, targetDeptId);

      if (!isAllowed) {
        return next(
          new ForbiddenError(
            'Access denied: You do not have permission to access resources belonging to this department.'
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Resource Ownership Access Control Middleware Factory:
 * Ensures a citizen can only access resources belonging to their own user account.
 * 
 * - ADMIN: Granted cross-resource access.
 * - CITIZEN / USER: Granted access ONLY when req.user.id matches the resource owner's user ID.
 * 
 * @param ownerResolver Static owner user ID string or dynamic extractor function
 */
export const requireResourceOwner = (ownerResolver?: OwnerIdResolver) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      // Resolve the resource owner's user ID
      let targetOwnerId: string | undefined | null;

      if (typeof ownerResolver === 'function') {
        targetOwnerId = await ownerResolver(req);
      } else if (typeof ownerResolver === 'string') {
        targetOwnerId = ownerResolver;
      } else {
        // Default extraction fallback: req.params.userId -> req.params.id -> req.body.userId
        targetOwnerId =
          req.params.userId ||
          req.params.id ||
          (req.body && req.body.userId);
      }

      if (!targetOwnerId) {
        return next(new BadRequestError('Resource owner User ID is required to evaluate ownership'));
      }

      // Check ownership using server-side authenticated identity
      const isOwner = checkResourceOwner(req.user, targetOwnerId);

      if (!isOwner) {
        return next(
          new ForbiddenError(
            'Access denied: You can only access resources belonging to your own account.'
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
