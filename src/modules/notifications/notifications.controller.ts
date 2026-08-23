import { NextFunction, Request, Response } from 'express';
import { ApiResponse } from '../../utils/apiResponse.js';
import { getAuthenticatedUser } from '../../utils/authHelpers.js';
import { NotificationsService } from './notifications.service.js';

export class NotificationsController {
  /**
   * GET /api/v1/notifications
   * Retrieve paginated notifications belonging to the authenticated user
   */
  public static getUserNotifications = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const result = await NotificationsService.getUserNotifications(
        user.id,
        req.query as any
      );
      ApiResponse.success(res, result, 'Notifications retrieved successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/notifications/unread-count
   * Retrieve total unread notifications count for the authenticated user
   */
  public static getUnreadCount = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const result = await NotificationsService.getUnreadCount(user.id);
      ApiResponse.success(res, result, 'Unread notifications count retrieved');
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/notifications/:notificationId/read
   * Mark a single notification as read (ownership enforced)
   */
  public static markAsRead = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const result = await NotificationsService.markAsRead(
        user.id,
        req.params.notificationId
      );
      ApiResponse.success(res, result, 'Notification marked as read successfully');
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/v1/notifications/read-all
   * Mark all notifications belonging to the authenticated user as read
   */
  public static markAllAsRead = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const result = await NotificationsService.markAllAsRead(user.id);
      ApiResponse.success(res, result, 'All notifications marked as read successfully');
    } catch (error) {
      next(error);
    }
  };
}
