import { Router } from 'express';
import { requireAdmin, requireAuthentication } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { DepartmentsController } from './departments.controller.js';
import {
  createDepartmentSchema,
  createOfficeSchema,
  departmentIdParamSchema,
  nearestOfficeQuerySchema,
  officeIdParamSchema,
  updateDepartmentSchema,
  updateOfficeSchema,
} from './departments.schema.js';

export const departmentsRouter = Router();
export const officesRouter = Router();

// =============================================================================
// Departments Routes (/api/v1/departments/*)
// =============================================================================

// GET /api/v1/departments: List all active departments
departmentsRouter.get('/', DepartmentsController.getDepartments);

// GET /api/v1/departments/:departmentId: Get specific active department
departmentsRouter.get(
  '/:departmentId',
  validate({ params: departmentIdParamSchema }),
  DepartmentsController.getDepartmentById
);

// GET /api/v1/departments/:departmentId/offices: Get active offices for a department
departmentsRouter.get(
  '/:departmentId/offices',
  validate({ params: departmentIdParamSchema }),
  DepartmentsController.getDepartmentOffices
);

// GET /api/v1/departments/:departmentId/nearest-office: Calculate nearest office using GPS coordinates
departmentsRouter.get(
  '/:departmentId/nearest-office',
  validate({ params: departmentIdParamSchema, query: nearestOfficeQuerySchema }),
  DepartmentsController.getNearestOffice
);

// POST /api/v1/departments: Create a new department (ADMIN ONLY)
departmentsRouter.post(
  '/',
  requireAuthentication,
  requireAdmin,
  validate({ body: createDepartmentSchema }),
  DepartmentsController.createDepartment
);

// PATCH /api/v1/departments/:departmentId: Update department metadata (ADMIN ONLY)
departmentsRouter.patch(
  '/:departmentId',
  requireAuthentication,
  requireAdmin,
  validate({ params: departmentIdParamSchema, body: updateDepartmentSchema }),
  DepartmentsController.updateDepartment
);

// POST /api/v1/departments/:departmentId/offices: Create office under department (ADMIN ONLY)
departmentsRouter.post(
  '/:departmentId/offices',
  requireAuthentication,
  requireAdmin,
  validate({ params: departmentIdParamSchema, body: createOfficeSchema }),
  DepartmentsController.createOffice
);

// =============================================================================
// Offices Direct Routes (/api/v1/offices/*)
// =============================================================================

// GET /api/v1/offices/:officeId: Get single active office details
officesRouter.get(
  '/:officeId',
  validate({ params: officeIdParamSchema }),
  DepartmentsController.getOfficeById
);

// PATCH /api/v1/offices/:officeId: Update office metadata (ADMIN ONLY)
officesRouter.patch(
  '/:officeId',
  requireAuthentication,
  requireAdmin,
  validate({ params: officeIdParamSchema, body: updateOfficeSchema }),
  DepartmentsController.updateOffice
);

// DELETE /api/v1/offices/:officeId: Deactivate office (ADMIN ONLY)
officesRouter.delete(
  '/:officeId',
  requireAuthentication,
  requireAdmin,
  validate({ params: officeIdParamSchema }),
  DepartmentsController.deactivateOffice
);
