import { Router } from 'express';
import {
  requireAdmin,
  requireAuthentication,
} from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { AdminController } from './admin.controller.js';
import {
  assignOfficerDepartmentSchema,
  departmentIdParamSchema,
  listOfficersQuerySchema,
  officerIdParamSchema,
  rejectOfficerSchema,
} from './admin.schema.js';

export const adminRouter = Router();

// Enforce authentication & ADMIN role across all administrative endpoints
adminRouter.use(requireAuthentication, requireAdmin);

// =============================================================================
// Administrative Officer Verification & Management Endpoints
// =============================================================================

// GET /api/v1/admin/complaints/summary: Complaint metrics summary overview
adminRouter.get(
  '/complaints/summary',
  AdminController.getComplaintsSummary
);

// GET /api/v1/admin/officers: List officer registrations with filtering & pagination
adminRouter.get(
  '/officers',
  validate({ query: listOfficersQuerySchema }),
  AdminController.listOfficers
);

// GET /api/v1/admin/departments/:departmentId/officers: List officers by department
adminRouter.get(
  '/departments/:departmentId/officers',
  validate({ params: departmentIdParamSchema, query: listOfficersQuerySchema }),
  AdminController.listOfficersByDepartment
);

// GET /api/v1/admin/officers/:officerId: Detailed officer profile view
adminRouter.get(
  '/officers/:officerId',
  validate({ params: officerIdParamSchema }),
  AdminController.getOfficerById
);

// PATCH /api/v1/admin/officers/:officerId/approve: Approve officer registration
adminRouter.patch(
  '/officers/:officerId/approve',
  validate({ params: officerIdParamSchema }),
  AdminController.approveOfficer
);

// PATCH /api/v1/admin/officers/:officerId/reject: Reject officer registration with reason
adminRouter.patch(
  '/officers/:officerId/reject',
  validate({ params: officerIdParamSchema, body: rejectOfficerSchema }),
  AdminController.rejectOfficer
);

// PATCH /api/v1/admin/officers/:officerId/department: Assign or change officer department
adminRouter.patch(
  '/officers/:officerId/department',
  validate({ params: officerIdParamSchema, body: assignOfficerDepartmentSchema }),
  AdminController.assignOfficerDepartment
);
