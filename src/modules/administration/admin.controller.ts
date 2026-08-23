import { NextFunction, Request, Response } from 'express';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AdminService } from './admin.service.js';

export class AdminController {
  /**
   * GET /api/v1/admin/officers
   * List officer registrations with optional filters and pagination
   */
  public static listOfficers = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await AdminService.listOfficers(req.query as any);
      ApiResponse.success(res, result, 'Officer registrations retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/admin/officers/:officerId
   * Retrieve detailed officer profile
   */
  public static getOfficerById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await AdminService.getOfficerById(req.params.officerId);
      ApiResponse.success(res, result, 'Officer details retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/admin/officers/:officerId/approve
   * Approve officer registration
   */
  public static approveOfficer = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await AdminService.approveOfficer(req.params.officerId);
      ApiResponse.success(res, result, 'Officer approved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/admin/officers/:officerId/reject
   * Reject officer registration with reason
   */
  public static rejectOfficer = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await AdminService.rejectOfficer(
        req.params.officerId,
        req.body
      );
      ApiResponse.success(res, result, 'Officer rejected successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/admin/officers/:officerId/department
   * Assign or modify officer department
   */
  public static assignOfficerDepartment = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await AdminService.assignOfficerDepartment(
        req.params.officerId,
        req.body.department_id
      );
      ApiResponse.success(res, result, 'Officer department updated successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/admin/departments/:departmentId/officers
   * List officers belonging to a specific department
   */
  public static listOfficersByDepartment = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await AdminService.listOfficersByDepartment(
        req.params.departmentId,
        req.query as any
      );
      ApiResponse.success(res, result, 'Department officers retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/admin/complaints/summary
   * Summary overview of complaint metrics for administration
   */
  public static getComplaintsSummary = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await AdminService.getComplaintsSummary();
      ApiResponse.success(res, result, 'Complaints summary retrieved successfully');
    } catch (error) {
      next(error);
    }
  };
}
