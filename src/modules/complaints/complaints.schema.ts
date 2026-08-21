import { z } from 'zod';

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
    // Only accept data-URI images or files previously stored by this service.
    // External URLs are deliberately rejected to avoid trusting arbitrary remote content.
    photo_url: z
      .string()
      .refine(
        (value) =>
          value.startsWith('data:image/') || value.startsWith('/uploads/'),
        { message: 'photo_url must be a data image or a locally stored upload path' }
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

export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;
