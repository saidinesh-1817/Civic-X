import { NextFunction, Request, Response } from 'express';
import { ApiResponse } from '../../utils/apiResponse.js';
import { getAuthenticatedUser } from '../../utils/authHelpers.js';
import { ComplaintsService } from './complaints.service.js';

export class ComplaintsController {
  /**
   * POST /api/v1/complaints
   * Submit a new civic complaint (CITIZEN ONLY)
   */
  public static createComplaint = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const citizen = getAuthenticatedUser(req);
      const complaint = await ComplaintsService.createComplaint(citizen, req.body);
      ApiResponse.created(res, complaint, 'Complaint registered successfully');
    } catch (error) {
      next(error);
    }
  };
}
