import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import {
  requireAuthentication,
  requireCitizen,
  requireOfficer,
  requireAdmin,
  requireRoles,
  requireDepartmentAccess,
  requireResourceOwner,
} from '../../middlewares/authorization.middleware.js';
import { ApiResponse } from '../../utils/apiResponse.js';

export const testRouter = Router();

/**
 * Diagnostic & Verification Endpoints for CivicSense B4 Authorization
 * Note: These endpoints are strictly for testing and RBAC/DAC verification.
 */

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

testRouter.post(
  '/department-body',
  requireAuthentication,
  requireDepartmentAccess((req) => req.body?.department_id),
  (req: Request, res: Response) => {
    ApiResponse.success(
      res,
      {
        message: 'Access granted to department resource via body validation',
        targetDepartmentId: req.body?.department_id,
        userDepartmentId: req.user?.officer_profile?.department_id,
      },
      'Department body access verified'
    );
  }
);

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
