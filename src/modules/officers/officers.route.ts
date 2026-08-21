import { Router } from 'express';
import {
  requireApprovedOfficer,
  requireAuthentication,
} from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { OfficersController } from './officers.controller.js';
import {
  assignComplaintSchema,
  complaintIdParamSchema,
  officerComplaintsQuerySchema,
} from './officers.schema.js';

export const officersRouter = Router();

// =============================================================================
// Officer Complaint Endpoints (/api/v1/officer/* & /api/v1/officers/*)
// =============================================================================

// GET /complaints: Retrieve complaints for the officer's department (APPROVED OFFICER ONLY)
officersRouter.get(
  '/complaints',
  requireAuthentication,
  requireApprovedOfficer,
  validate({ query: officerComplaintsQuerySchema }),
  OfficersController.getDepartmentComplaints
);

// GET /complaints/:complaintId: Retrieve single complaint details (APPROVED OFFICER ONLY)
officersRouter.get(
  '/complaints/:complaintId',
  requireAuthentication,
  requireApprovedOfficer,
  validate({ params: complaintIdParamSchema }),
  OfficersController.getDepartmentComplaintById
);

// POST /complaints/:complaintId/assign: Accept and assign a complaint (APPROVED OFFICER ONLY)
officersRouter.post(
  '/complaints/:complaintId/assign',
  requireAuthentication,
  requireApprovedOfficer,
  validate({ params: complaintIdParamSchema, body: assignComplaintSchema }),
  OfficersController.assignComplaint
);
