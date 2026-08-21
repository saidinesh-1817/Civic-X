import { z } from 'zod';

/**
 * Validation schema for :departmentId route parameter
 */
export const departmentIdParamSchema = z.object({
  departmentId: z.string().uuid({ message: 'Invalid Department ID format. Must be a valid UUID.' }),
});

/**
 * Validation schema for :officeId route parameter
 */
export const officeIdParamSchema = z.object({
  officeId: z.string().uuid({ message: 'Invalid Office ID format. Must be a valid UUID.' }),
});

/**
 * Validation schema for finding nearest department office via coordinates
 */
export const nearestOfficeQuerySchema = z.object({
  latitude: z.coerce
    .number({ invalid_type_error: 'Latitude must be a valid number' })
    .min(-90, { message: 'Latitude must be between -90 and 90 degrees' })
    .max(90, { message: 'Latitude must be between -90 and 90 degrees' }),
  longitude: z.coerce
    .number({ invalid_type_error: 'Longitude must be a valid number' })
    .min(-180, { message: 'Longitude must be between -180 and 180 degrees' })
    .max(180, { message: 'Longitude must be between -180 and 180 degrees' }),
});

/**
 * Admin: Schema for creating a new Department
 */
export const createDepartmentSchema = z.object({
  name: z
    .string({ required_error: 'Department name is required' })
    .trim()
    .min(2, { message: 'Department name must be at least 2 characters' })
    .max(255, { message: 'Department name cannot exceed 255 characters' }),
  description: z.string().trim().optional().nullable(),
  active: z.boolean().optional().default(true),
});

/**
 * Admin: Schema for updating an existing Department
 */
export const updateDepartmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: 'Department name must be at least 2 characters' })
    .max(255, { message: 'Department name cannot exceed 255 characters' })
    .optional(),
  description: z.string().trim().optional().nullable(),
  active: z.boolean().optional(),
});

/**
 * Admin: Schema for creating a new Department Office
 */
export const createOfficeSchema = z.object({
  name: z
    .string({ required_error: 'Office name is required' })
    .trim()
    .min(2, { message: 'Office name must be at least 2 characters' })
    .max(255, { message: 'Office name cannot exceed 255 characters' }),
  address: z
    .string({ required_error: 'Office address is required' })
    .trim()
    .min(5, { message: 'Office address must be at least 5 characters' }),
  latitude: z
    .number({ required_error: 'Latitude coordinate is required' })
    .min(-90, { message: 'Latitude must be between -90 and 90 degrees' })
    .max(90, { message: 'Latitude must be between -90 and 90 degrees' }),
  longitude: z
    .number({ required_error: 'Longitude coordinate is required' })
    .min(-180, { message: 'Longitude must be between -180 and 180 degrees' })
    .max(180, { message: 'Longitude must be between -180 and 180 degrees' }),
  active: z.boolean().optional().default(true),
});

/**
 * Admin: Schema for updating an existing Department Office
 * Note: department_id is intentionally omitted to prevent client tampering with department ownership
 */
export const updateOfficeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: 'Office name must be at least 2 characters' })
    .max(255, { message: 'Office name cannot exceed 255 characters' })
    .optional(),
  address: z
    .string()
    .trim()
    .min(5, { message: 'Office address must be at least 5 characters' })
    .optional(),
  latitude: z
    .number()
    .min(-90, { message: 'Latitude must be between -90 and 90 degrees' })
    .max(90, { message: 'Latitude must be between -90 and 90 degrees' })
    .optional(),
  longitude: z
    .number()
    .min(-180, { message: 'Longitude must be between -180 and 180 degrees' })
    .max(180, { message: 'Longitude must be between -180 and 180 degrees' })
    .optional(),
  active: z.boolean().optional(),
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type CreateOfficeInput = z.infer<typeof createOfficeSchema>;
export type UpdateOfficeInput = z.infer<typeof updateOfficeSchema>;
export type NearestOfficeQueryInput = z.infer<typeof nearestOfficeQuerySchema>;
