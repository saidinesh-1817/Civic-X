import { Router } from 'express';
import { requireAuthentication } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { NotificationsController } from './notifications.controller.js';
import {
  notificationIdParamSchema,
  notificationsQuerySchema,
} from './notifications.schema.js';

export const notificationsRouter = Router();

// =============================================================================
// In-App Notifications Endpoints (/api/v1/notifications/*)
// =============================================================================

// GET /unread-count: Retrieve total unread notifications count for current user
notificationsRouter.get(
  '/unread-count',
  requireAuthentication,
  NotificationsController.getUnreadCount
);

// PATCH /read-all: Mark all notifications for current user as read
notificationsRouter.patch(
  '/read-all',
  requireAuthentication,
  NotificationsController.markAllAsRead
);

// GET /: Retrieve paginated notifications for current user
notificationsRouter.get(
  '/',
  requireAuthentication,
  validate({ query: notificationsQuerySchema }),
  NotificationsController.getUserNotifications
);

// PATCH /:notificationId/read: Mark single notification as read
notificationsRouter.patch(
  '/:notificationId/read',
  requireAuthentication,
  validate({ params: notificationIdParamSchema }),
  NotificationsController.markAsRead
);
