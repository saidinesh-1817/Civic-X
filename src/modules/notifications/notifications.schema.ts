import { z } from 'zod';

/**
 * Validation schema for listing notifications: GET /api/v1/notifications
 */
export const notificationsQuerySchema = z.object({
  page: z.coerce
    .number({ invalid_type_error: 'Page must be a valid number' })
    .int()
    .min(1, { message: 'Page must be greater than or equal to 1' })
    .optional()
    .default(1),
  limit: z.coerce
    .number({ invalid_type_error: 'Limit must be a valid number' })
    .int()
    .min(1, { message: 'Limit must be at least 1' })
    .max(50, { message: 'Limit cannot exceed 50' })
    .optional()
    .default(20),
  is_read: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean().optional()),
});

/**
 * Validation schema for :notificationId URL parameter
 */
export const notificationIdParamSchema = z.object({
  notificationId: z.string().uuid({
    message: 'Invalid Notification ID format. Must be a valid UUID.',
  }),
});

export type NotificationsQueryInput = z.infer<typeof notificationsQuerySchema>;
export type NotificationIdParamInput = z.infer<typeof notificationIdParamSchema>;
