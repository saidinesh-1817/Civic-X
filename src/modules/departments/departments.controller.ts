import { NextFunction, Request, Response } from 'express';
import { ApiResponse } from '../../utils/apiResponse.js';
import { DepartmentsService } from './departments.service.js';

export class DepartmentsController {
  /**
   * GET /api/v1/departments
   * Retrieve all active departments
   */
  public static getDepartments = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const departments = await DepartmentsService.getAllDepartments(true);
      ApiResponse.success(res, departments, 'Active departments retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/departments/:departmentId
   * Retrieve a single department by ID
   */
  public static getDepartmentById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const department = await DepartmentsService.getDepartmentById(req.params.departmentId, true);
      ApiResponse.success(res, department, 'Department details retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/departments/:departmentId/offices
   * Retrieve all active offices belonging to a department
   */
  public static getDepartmentOffices = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const offices = await DepartmentsService.getOfficesByDepartmentId(
        req.params.departmentId,
        true
      );
      ApiResponse.success(res, offices, 'Department offices retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/departments/:departmentId/nearest-office
   * Calculate nearest active department office using citizen GPS coordinates
   */
  public static getNearestOffice = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { departmentId } = req.params;
      const latitude = Number(req.query.latitude);
      const longitude = Number(req.query.longitude);

      const result = await DepartmentsService.findNearestDepartmentOffice(
        departmentId,
        latitude,
        longitude
      );

      ApiResponse.success(res, result, 'Nearest department office calculated successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/offices/:officeId
   * Retrieve a single department office by ID
   */
  public static getOfficeById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const office = await DepartmentsService.getOfficeById(req.params.officeId, true);
      ApiResponse.success(res, office, 'Department office retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  // ---------------------------------------------------------------------------
  // Admin Controller Actions (Protected by ADMIN Authorization)
  // ---------------------------------------------------------------------------

  /**
   * POST /api/v1/departments (ADMIN ONLY)
   * Create a new civic department
   */
  public static createDepartment = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const created = await DepartmentsService.createDepartment(req.body);
      ApiResponse.created(res, created, 'Department created successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/departments/:departmentId (ADMIN ONLY)
   * Update department metadata
   */
  public static updateDepartment = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const updated = await DepartmentsService.updateDepartment(req.params.departmentId, req.body);
      ApiResponse.success(res, updated, 'Department updated successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/departments/:departmentId/offices (ADMIN ONLY)
   * Create a new office under a department
   */
  public static createOffice = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const created = await DepartmentsService.createOffice(req.params.departmentId, req.body);
      ApiResponse.created(res, created, 'Department office created successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/offices/:officeId (ADMIN ONLY)
   * Update an office
   */
  public static updateOffice = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const updated = await DepartmentsService.updateOffice(req.params.officeId, req.body);
      ApiResponse.success(res, updated, 'Department office updated successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/offices/:officeId (ADMIN ONLY)
   * Deactivate an office
   */
  public static deactivateOffice = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await DepartmentsService.deactivateOffice(req.params.officeId);
      ApiResponse.success(res, result, 'Department office deactivated successfully');
    } catch (error) {
      next(error);
    }
  };
}
