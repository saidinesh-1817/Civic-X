import { z } from 'zod';
import { ComplaintStatus, Priority } from '@prisma/client';

/**
 * Validation schema for officer complaints listing query params: GET /api/v1/officer/complaints
 */
export const officerComplaintsQuerySchema = z.object({
  page: z.coerce.number({ invalid_type_error: 'Page must be a valid number' }).int().min(1, { message: 'Page must be greater than or equal to 1' }).optional().default(1),
  limit: z.coerce.number({ invalid_type_error: 'Limit must be a valid number' }).int().min(1, { message: 'Limit must be at least 1' }).max(50, { message: 'Limit cannot exceed 50' }).optional().default(10),
  status: z.nativeEnum(ComplaintStatus, { errorMap: () => ({ message: 'Invalid status filter. Allowed: NEW, ASSIGNED, IN_PROGRESS, RESOLVED' }) }).optional(),
  priority: z.nativeEnum(Priority, { errorMap: () => ({ message: 'Invalid priority filter. Allowed: LOW, MEDIUM, HIGH, CRITICAL' }) }).optional(),
  office_id: z.string().uuid({ message: 'Invalid Office ID format. Must be a valid UUID.' }).optional(),
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

/**
 * Validation schema for updating complaint status: PATCH /api/v1/officer/complaints/:complaintId/status
 */
export const updateComplaintStatusSchema = z.object({
  status: z.nativeEnum(ComplaintStatus, { errorMap: () => ({ message: 'Invalid status. Allowed: NEW, ASSIGNED, IN_PROGRESS, RESOLVED' }) }),
  note: z.string().trim().max(1000).optional(),
});

/**
 * Resolution evidence must be image data, not an external URL or arbitrary storage path.
 * The shared file-storage utility performs the authoritative MIME, magic-byte and size checks.
 */
const resolutionImageSchema = z.string().trim().refine(
  (value) => {
    if (value.startsWith('data:image/')) return true;
    return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
  },
  { message: 'Resolution photo must be a base64-encoded image or data URI; external URLs are not allowed' }
);

/**
 * Validation schema for resolving complaint: POST /api/v1/officer/complaints/:complaintId/resolve
 */
export const resolveComplaintSchema = z
  .object({
    note: z.string().trim().max(5000).optional(),
    resolution_note: z.string().trim().max(5000).optional(),
    photo: resolutionImageSchema.optional(),
    photo_url: resolutionImageSchema.optional(),
    resolution_photo: resolutionImageSchema.optional(),
    resolution_photo_url: resolutionImageSchema.optional(),
  })
  .refine(
    (data) => {
      const note = data.note || data.resolution_note;
      return typeof note === 'string' && note.trim().length > 0;
    },
    { message: 'Resolution note is required', path: ['note'] }
  )
  .refine(
    (data) => {
      const photo = data.photo || data.photo_url || data.resolution_photo || data.resolution_photo_url;
      return typeof photo === 'string' && photo.trim().length > 0;
    },
    { message: 'Resolution photo is required', path: ['photo'] }
  );

export type OfficerComplaintsQueryInput = z.infer<typeof officerComplaintsQuerySchema>;
export type AssignComplaintInput = z.infer<typeof assignComplaintSchema>;
export type UpdateComplaintStatusInput = z.infer<typeof updateComplaintStatusSchema>;
export type ResolveComplaintInput = z.infer<typeof resolveComplaintSchema>;
