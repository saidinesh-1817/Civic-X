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
  listAdminComplaintsQuerySchema,
  listOfficersQuerySchema,
  listUsersQuerySchema,
  officerIdParamSchema,
  rejectOfficerSchema,
  userIdParamSchema,
} from './admin.schema.js';

export const adminRouter = Router();

// Enforce authentication & ADMIN role across all administrative endpoints
adminRouter.use(requireAuthentication, requireAdmin);

// =============================================================================
// Administrative Overview & System Metrics Endpoints
// =============================================================================

// GET /api/v1/admin/complaints/summary: Complaint metrics summary overview
adminRouter.get(
  '/complaints/summary',
  AdminController.getComplaintsSummary
);

// GET /api/v1/admin/complaints/hotspots: Aggregated civic hotspots
adminRouter.get(
  '/complaints/hotspots',
  AdminController.getCivicHotspots
);

// GET /api/v1/admin/departments/statistics: Department performance and SLA statistics
adminRouter.get(
  '/departments/statistics',
  AdminController.getDepartmentStatistics
);

// =============================================================================
// Administrative Master Complaints Endpoints
// =============================================================================

// GET /api/v1/admin/complaints: List all civic complaints system-wide
adminRouter.get(
  '/complaints',
  validate({ query: listAdminComplaintsQuerySchema }),
  AdminController.listComplaints
);

// =============================================================================
// Administrative Officer Verification & Management Endpoints
// =============================================================================

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

// PATCH /api/v1/admin/officers/:officerId/block: Block officer account
adminRouter.patch(
  '/officers/:officerId/block',
  validate({ params: officerIdParamSchema }),
  AdminController.blockOfficer
);

// PATCH /api/v1/admin/officers/:officerId/unblock: Unblock officer account
adminRouter.patch(
  '/officers/:officerId/unblock',
  validate({ params: officerIdParamSchema }),
  AdminController.unblockOfficer
);

// =============================================================================
// Administrative User Management & Blocking Endpoints
// =============================================================================

// GET /api/v1/admin/users: List users with filtering & pagination
adminRouter.get(
  '/users',
  validate({ query: listUsersQuerySchema }),
  AdminController.listUsers
);

// GET /api/v1/admin/users/:userId: Retrieve single user profile
adminRouter.get(
  '/users/:userId',
  validate({ params: userIdParamSchema }),
  AdminController.getUserById
);

// PATCH /api/v1/admin/users/:userId/block: Block a citizen or user account
adminRouter.patch(
  '/users/:userId/block',
  validate({ params: userIdParamSchema }),
  AdminController.blockUser
);

// PATCH /api/v1/admin/users/:userId/unblock: Unblock a citizen or user account
adminRouter.patch(
  '/users/:userId/unblock',
  validate({ params: userIdParamSchema }),
  AdminController.unblockUser
);
