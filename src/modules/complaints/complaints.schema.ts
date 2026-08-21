import { z } from 'zod';
import { ComplaintStatus } from '@prisma/client';

/**
 * Validation schema for submitting a new civic complaint: POST /api/v1/complaints
 */
export const createComplaintSchema = z
  .object({
    title: z
      .string({ required_error: 'Complaint title is required' })
      .trim()
      .min(3, { message: 'Title must be at least 3 characters' })
      .max(255, { message: 'Title cannot exceed 255 characters' }),
    description: z
      .string({ required_error: 'Complaint description is required' })
      .trim()
      .min(10, { message: 'Description must be at least 10 characters' })
      .max(5000, { message: 'Description cannot exceed 5000 characters' }),
    department_id: z
      .string({ required_error: 'Department ID is required' })
      .uuid({ message: 'Invalid Department ID format. Must be a valid UUID.' }),
    latitude: z
      .number({ invalid_type_error: 'Latitude must be a valid number' })
      .min(-90, { message: 'Latitude must be between -90 and 90 degrees' })
      .max(90, { message: 'Latitude must be between -90 and 90 degrees' })
      .optional()
      .nullable(),
    longitude: z
      .number({ invalid_type_error: 'Longitude must be a valid number' })
      .min(-180, { message: 'Longitude must be between -180 and 180 degrees' })
      .max(180, { message: 'Longitude must be between -180 and 180 degrees' })
      .optional()
      .nullable(),
    photo: z.string().optional().nullable(),
    photo_url: z
      .string()
      .refine(
        (value) =>
          value.startsWith('data:image/') ||
          value.startsWith('/uploads/') ||
          value.startsWith('http://') ||
          value.startsWith('https://'),
        { message: 'photo_url must be a valid image data URI or upload path' }
      )
      .optional()
      .nullable(),
  })
  .refine(
    (data) => {
      const hasLat = data.latitude !== undefined && data.latitude !== null;
      const hasLon = data.longitude !== undefined && data.longitude !== null;
      // If one is provided, both must be provided
      return (hasLat && hasLon) || (!hasLat && !hasLon);
    },
    {
      message: 'Both latitude and longitude must be provided together for location tagging',
      path: ['latitude'],
    }
  );

/**
 * Validation schema for :complaintId URL parameter
 */
export const complaintIdParamSchema = z.object({
  complaintId: z.string().uuid({ message: 'Invalid Complaint ID format. Must be a valid UUID.' }),
});

/**
 * Validation schema for citizen complaints listing query params: GET /api/v1/complaints/my
 */
export const myComplaintsQuerySchema = z.object({
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
      errorMap: () => ({ message: 'Invalid status filter. Allowed: NEW, ASSIGNED, IN_PROGRESS, RESOLVED' }),
    })
    .optional(),
  department_id: z
    .string()
    .uuid({ message: 'Invalid Department ID format. Must be a valid UUID.' })
    .optional(),
});

export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;
export type MyComplaintsQueryInput = z.infer<typeof myComplaintsQuerySchema>;
