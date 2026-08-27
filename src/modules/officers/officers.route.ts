import { Router } from 'express';
import {
  requireApprovedOfficer,
  requireAuthentication,
} from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { OfficersController } from './officers.controller.js';
import {
  addProgressNoteSchema,
  assignComplaintSchema,
  complaintIdParamSchema,
  officerComplaintsQuerySchema,
  resolveComplaintSchema,
  updateComplaintStatusSchema,
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

// PATCH /complaints/:complaintId/status: Start work or update status on a complaint (APPROVED OFFICER ONLY)
officersRouter.patch(
  '/complaints/:complaintId/status',
  requireAuthentication,
  requireApprovedOfficer,
  validate({ params: complaintIdParamSchema, body: updateComplaintStatusSchema }),
  OfficersController.updateComplaintStatus
);

// POST /complaints/:complaintId/progress: Add progress update note (APPROVED OFFICER ONLY)
officersRouter.post(
  '/complaints/:complaintId/progress',
  requireAuthentication,
  requireApprovedOfficer,
  validate({ params: complaintIdParamSchema, body: addProgressNoteSchema }),
  OfficersController.addProgressNote
);

// POST /complaints/:complaintId/resolve: Resolve an in-progress complaint with photo & note (APPROVED OFFICER ONLY)
officersRouter.post(
  '/complaints/:complaintId/resolve',
  requireAuthentication,
  requireApprovedOfficer,
  validate({ params: complaintIdParamSchema, body: resolveComplaintSchema }),
  OfficersController.resolveComplaint
);
