import { z } from 'zod';
import { ComplaintStatus, Priority } from '@prisma/client';

/**
 * Validation schema for officer complaints listing query params: GET /api/v1/officer/complaints
 */
export const officerComplaintsQuerySchema = z.object({
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
    .default(10),
  status: z
    .nativeEnum(ComplaintStatus, {
      errorMap: () => ({
        message: 'Invalid status filter. Allowed: NEW, ASSIGNED, IN_PROGRESS, RESOLVED',
      }),
    })
    .optional(),
  priority: z
    .nativeEnum(Priority, {
      errorMap: () => ({
        message: 'Invalid priority filter. Allowed: LOW, MEDIUM, HIGH, CRITICAL',
      }),
    })
    .optional(),
  office_id: z
    .string()
    .uuid({ message: 'Invalid Office ID format. Must be a valid UUID.' })
    .optional(),
  from_date: z.string().datetime({ message: 'from_date must be a valid ISO 8601 datetime' }).optional(),
  to_date: z.string().datetime({ message: 'to_date must be a valid ISO 8601 datetime' }).optional(),
});

/**
 * Validation schema for complaint assignment: POST /api/v1/officer/complaints/:complaintId/assign
 */
export const assignComplaintSchema = z.object({
  action: z.enum(['ACCEPT', 'ASSIGN']).optional().default('ACCEPT'),
  note: z.string().trim().max(1000).optional(),
});

/**
 * Validation schema for :complaintId URL parameter
 */
export const complaintIdParamSchema = z.object({
  complaintId: z.string().uuid({ message: 'Invalid Complaint ID format. Must be a valid UUID.' }),
});

export type OfficerComplaintsQueryInput = z.infer<typeof officerComplaintsQuerySchema>;
export type AssignComplaintInput = z.infer<typeof assignComplaintSchema>;
