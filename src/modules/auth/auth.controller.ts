import { NextFunction, Request, Response } from 'express';
import { ApiResponse } from '../../utils/apiResponse.js';
import { AuthService } from './auth.service.js';

export class AuthController {
  /**
   * POST /api/v1/auth/register (or /register/citizen)
   * Register a new citizen user
   */
  public static registerCitizen = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await AuthService.registerCitizen(req.body);
      ApiResponse.created(res, result, 'Citizen registered successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/register/officer
   * Register a new field officer account (status: PENDING)
   */
  public static registerOfficer = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await AuthService.registerOfficer(req.body);
      ApiResponse.created(
        res,
        result,
        'Officer account registered successfully. Verification pending administrative approval.'
      );
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/login
   * Universal login for Citizens, Approved Officers, and Admins
   */
  public static login = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await AuthService.login(req.body);
      ApiResponse.success(res, result, 'Login successful');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/auth/me
   * Retrieve current authenticated user profile
   */
  public static getMe = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // req.user is attached by authenticate middleware
      ApiResponse.success(res, req.user, 'Current user profile retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/auth/logout
   * Client-side token invalidation confirmation
   */
  public static logout = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      ApiResponse.success(res, null, 'Logged out successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/auth/test/role-check
   * Diagnostic test endpoint to verify role-based access control
   */
  public static testRoleCheck = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      ApiResponse.success(
        res,
        {
          authenticatedUser: req.user,
          authorizedRole: req.user?.role,
        },
        'Role authorization verified successfully'
      );
    } catch (error) {
      next(error);
    }
  };
}
