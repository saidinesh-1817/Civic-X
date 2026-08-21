import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import {
  requireAdmin,
  requireAuthentication,
  requireCitizen,
  requireDepartmentAccess,
  requireOfficer,
  requireResourceOwner,
  requireRoles,
} from '../../middlewares/auth.middleware.js';
import { ApiResponse } from '../../utils/apiResponse.js';

export const testRouter = Router();

/**
 * Diagnostic & Verification Endpoints for CivicSense B4 Authorization
 * Note: These endpoints are strictly for testing and RBAC/DAC verification.
 */

// General Protected Endpoint: Requires any valid authenticated user
testRouter.get(
  '/protected',
  requireAuthentication,
  (req: Request, res: Response) => {
    ApiResponse.success(
      res,
      {
        message: 'Access granted to protected endpoint',
        user: req.user,
      },
      'Protected authorization verified'
    );
  }
);

// Citizen Protected Endpoint: Requires role = CITIZEN
testRouter.get(
  '/citizen',
  requireAuthentication,
  requireCitizen,
  (req: Request, res: Response) => {
    ApiResponse.success(
      res,
      {
        message: 'Access granted to citizen-only resource',
        user: req.user,
      },
      'Citizen authorization verified'
    );
  }
);

// Officer Protected Endpoint: Requires role = OFFICER and verification_status = APPROVED
testRouter.get(
  '/officer',
  requireAuthentication,
  requireOfficer,
  (req: Request, res: Response) => {
    ApiResponse.success(
      res,
      {
        message: 'Access granted to approved officer-only resource',
        user: req.user,
        departmentId: req.user?.officer_profile?.department_id,
      },
      'Officer authorization verified'
    );
  }
);

// Admin Protected Endpoint: Requires role = ADMIN
testRouter.get(
  '/admin',
  requireAuthentication,
  requireAdmin,
  (req: Request, res: Response) => {
    ApiResponse.success(
      res,
      {
        message: 'Access granted to admin-only resource',
        user: req.user,
      },
      'Admin authorization verified'
    );
  }
);

// Multi-Role Staff Endpoint: Requires role = OFFICER or ADMIN
testRouter.get(
  '/roles/staff',
  requireAuthentication,
  requireRoles(Role.OFFICER, Role.ADMIN),
  (req: Request, res: Response) => {
    ApiResponse.success(
      res,
      {
        message: 'Access granted to staff resource (Officer or Admin)',
        user: req.user,
      },
      'Staff role authorization verified'
    );
  }
);

// Department-Scoped Resource (via URL parameter):
// Enforces that only officers belonging to :departmentId (or Admins) can access
testRouter.get(
  '/department/:departmentId',
  requireAuthentication,
  requireDepartmentAccess((req) => req.params.departmentId),
  (req: Request, res: Response) => {
    ApiResponse.success(
      res,
      {
        message: `Access granted to department resource (${req.params.departmentId})`,
        user: req.user,
        targetDepartmentId: req.params.departmentId,
        userDepartmentId: req.user?.officer_profile?.department_id,
      },
      'Department access verified'
    );
  }
);

// Department-Scoped Resource (via Request Body):
// Verifies that authorization checks against server-side session, ignoring spoofed parameters
testRouter.post(
  '/department-body',
  requireAuthentication,
  requireDepartmentAccess((req) => req.body?.department_id),
  (req: Request, res: Response) => {
    ApiResponse.success(
      res,
      {
        message: `Access granted to department resource via body validation`,
        targetDepartmentId: req.body?.department_id,
        userDepartmentId: req.user?.officer_profile?.department_id,
      },
      'Department body access verified'
    );
  }
);

// Citizen Resource Ownership Endpoint:
// Enforces that a citizen can only access resources with matching :userId (or Admins)
testRouter.get(
  '/owner/:userId',
  requireAuthentication,
  requireResourceOwner((req) => req.params.userId),
  (req: Request, res: Response) => {
    ApiResponse.success(
      res,
      {
        message: `Access granted to resource owned by user (${req.params.userId})`,
        resourceOwnerId: req.params.userId,
        authenticatedUserId: req.user?.id,
      },
      'Resource ownership verified'
    );
  }
);
