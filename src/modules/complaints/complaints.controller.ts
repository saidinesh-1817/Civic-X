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

  /**
   * GET /api/v1/complaints/my
   * Retrieve complaints submitted by the authenticated citizen
   */
  public static getMyComplaints = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const citizen = getAuthenticatedUser(req);
      const result = await ComplaintsService.getMyComplaints(citizen, req.query as any);
      ApiResponse.success(res, result, 'Citizen complaints retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/complaints/:complaintId
   * Retrieve detailed complaint view with status history and resolution
   */
  public static getComplaintById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const complaint = await ComplaintsService.getComplaintById(user, req.params.complaintId);
      ApiResponse.success(res, complaint, 'Complaint details retrieved successfully');
    } catch (error) {
      next(error);
    }
  };
}
