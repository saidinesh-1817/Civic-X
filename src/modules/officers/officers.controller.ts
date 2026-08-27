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

  /**
   * PATCH /api/v1/officer/complaints/:complaintId/status
   * Update complaint status to IN_PROGRESS (APPROVED OFFICER ONLY, ASSIGNED OFFICER ONLY)
   */
  public static updateComplaintStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const officer = getAuthenticatedUser(req);
      const result = await OfficersService.updateComplaintStatus(
        officer,
        req.params.complaintId,
        req.body
      );
      ApiResponse.success(res, result, 'Complaint status updated successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/officer/complaints/:complaintId/progress
   * Add a progress note to an active complaint (APPROVED OFFICER ONLY)
   */
  public static addProgressNote = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const officer = getAuthenticatedUser(req);
      const result = await OfficersService.addProgressNote(
        officer,
        req.params.complaintId,
        req.body
      );
      ApiResponse.success(res, result, 'Progress note recorded successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/officer/complaints/:complaintId/resolve
   * Resolve complaint with evidence photo and note (APPROVED OFFICER ONLY, ASSIGNED OFFICER ONLY)
   */
  public static resolveComplaint = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const officer = getAuthenticatedUser(req);
      const result = await OfficersService.resolveComplaint(
        officer,
        req.params.complaintId,
        req.body
      );
      ApiResponse.success(res, result, 'Complaint resolved successfully');
    } catch (error) {
      next(error);
    }
  };
}
