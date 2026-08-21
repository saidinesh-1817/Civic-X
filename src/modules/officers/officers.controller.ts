import { NextFunction, Request, Response } from 'express';
import { ApiResponse } from '../../utils/apiResponse.js';
import { getAuthenticatedUser } from '../../utils/authHelpers.js';
import { OfficersService } from './officers.service.js';

export class OfficersController {
  /**
   * GET /api/v1/officer/complaints
   * Retrieve complaints assigned to the officer's department (APPROVED OFFICER ONLY)
   */
  public static getDepartmentComplaints = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const officer = getAuthenticatedUser(req);
      const result = await OfficersService.getDepartmentComplaints(officer, req.query as any);
      ApiResponse.success(res, result, 'Department complaints retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/officer/complaints/:complaintId
   * Retrieve complaint details for the officer's department (APPROVED OFFICER ONLY)
   */
  public static getDepartmentComplaintById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const officer = getAuthenticatedUser(req);
      const complaint = await OfficersService.getDepartmentComplaintById(
        officer,
        req.params.complaintId
      );
      ApiResponse.success(res, complaint, 'Complaint details retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/officer/complaints/:complaintId/assign
   * Accept and assign a NEW complaint to the authenticated officer (APPROVED OFFICER ONLY)
   */
  public static assignComplaint = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const officer = getAuthenticatedUser(req);
      const result = await OfficersService.assignComplaint(
        officer,
        req.params.complaintId,
        req.body
      );
      ApiResponse.success(res, result, 'Complaint accepted and assigned successfully');
    } catch (error) {
      next(error);
    }
  };
}
