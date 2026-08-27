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
   * GET /api/v1/admin/complaints
   * List all civic complaints across all departments with filters & pagination
   */
  public static listComplaints = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await AdminService.listComplaints(req.query as any);
      ApiResponse.success(res, result, 'Master complaints list retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/admin/users
   * List all registered user accounts with filtering & pagination
   */
  public static listUsers = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await AdminService.listUsers(req.query as any);
      ApiResponse.success(res, result, 'Users list retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/admin/users/:userId
   * Retrieve single user details
   */
  public static getUserById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await AdminService.getUserById(req.params.userId);
      ApiResponse.success(res, result, 'User details retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/admin/users/:userId/block
   * Block a citizen or user account
   */
  public static blockUser = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const adminUserId = req.user!.id;
      const result = await AdminService.blockUser(adminUserId, req.params.userId);
      ApiResponse.success(res, result, 'User account blocked successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/admin/users/:userId/unblock
   * Unblock a citizen or user account
   */
  public static unblockUser = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await AdminService.unblockUser(req.params.userId);
      ApiResponse.success(res, result, 'User account unblocked successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/admin/officers/:officerId/block
   * Block an officer account
   */
  public static blockOfficer = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const adminUserId = req.user!.id;
      const result = await AdminService.blockOfficer(adminUserId, req.params.officerId);
      ApiResponse.success(res, result, 'Officer account blocked successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/admin/officers/:officerId/unblock
   * Unblock an officer account
   */
  public static unblockOfficer = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await AdminService.unblockOfficer(req.params.officerId);
      ApiResponse.success(res, result, 'Officer account unblocked successfully');
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

  /**
   * GET /api/v1/admin/complaints/hotspots
   * Aggregated civic hotspots by geographic cluster
   */
  public static getCivicHotspots = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await AdminService.getCivicHotspots();
      ApiResponse.success(res, result, 'Civic hotspots retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/admin/departments/statistics
   * Operational and resolution statistics per department
   */
  public static getDepartmentStatistics = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await AdminService.getDepartmentStatistics();
      ApiResponse.success(res, result, 'Department statistics retrieved successfully');
    } catch (error) {
      next(error);
    }
  };
}
