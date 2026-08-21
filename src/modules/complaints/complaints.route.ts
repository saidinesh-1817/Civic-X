import { Router } from 'express';
import { requireAuthentication, requireCitizen } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { ComplaintsController } from './complaints.controller.js';
import {
  complaintIdParamSchema,
  createComplaintSchema,
  myComplaintsQuerySchema,
} from './complaints.schema.js';

export const complaintsRouter = Router();

// =============================================================================
// Complaint Endpoints (/api/v1/complaints/*)
// =============================================================================

// GET /api/v1/complaints/my: Retrieve complaints submitted by the authenticated citizen (CITIZEN ONLY)
complaintsRouter.get(
  '/my',
  requireAuthentication,
  requireCitizen,
  validate({ query: myComplaintsQuerySchema }),
  ComplaintsController.getMyComplaints
);

// POST /api/v1/complaints: Submit a new civic complaint (CITIZEN ONLY)
complaintsRouter.post(
  '/',
  requireAuthentication,
  requireCitizen,
  validate({ body: createComplaintSchema }),
  ComplaintsController.createComplaint
);

// GET /api/v1/complaints/:complaintId: Retrieve single complaint details (Owner / Authorized only)
complaintsRouter.get(
  '/:complaintId',
  requireAuthentication,
  validate({ params: complaintIdParamSchema }),
  ComplaintsController.getComplaintById
);
