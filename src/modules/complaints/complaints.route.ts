import { Router } from 'express';
import { requireAuthentication, requireCitizen } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { ComplaintsController } from './complaints.controller.js';
import { createComplaintSchema } from './complaints.schema.js';

export const complaintsRouter = Router();

// =============================================================================
// Complaint Endpoints (/api/v1/complaints/*)
// =============================================================================

// POST /api/v1/complaints: Submit a new civic complaint (CITIZEN ONLY)
complaintsRouter.post(
  '/',
  requireAuthentication,
  requireCitizen,
  validate({ body: createComplaintSchema }),
  ComplaintsController.createComplaint
);
