import { VerificationStatus } from '@prisma/client';
import { z } from 'zod';

/**
 * Validation schema for listing officers: GET /api/v1/admin/officers
 */
export const listOfficersQuerySchema = z.object({
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
  verification_status: z
    .nativeEnum(VerificationStatus, {
      errorMap: () => ({
        message: `Invalid verification_status. Allowed values: [${Object.values(
          VerificationStatus
        ).join(', ')}]`,
      }),
    })
    .optional(),
  department_id: z
    .string()
    .uuid({ message: 'Invalid Department ID format. Must be a valid UUID.' })
    .optional(),
});

/**
 * Validation schema for :officerId URL parameter
 */
export const officerIdParamSchema = z.object({
  officerId: z.string().uuid({
    message: 'Invalid Officer ID format. Must be a valid UUID.',
  }),
});

/**
 * Validation schema for :departmentId URL parameter
 */
export const departmentIdParamSchema = z.object({
  departmentId: z.string().uuid({
    message: 'Invalid Department ID format. Must be a valid UUID.',
  }),
});

/**
 * Validation schema for rejecting officer: PATCH /api/v1/admin/officers/:officerId/reject
 */
export const rejectOfficerSchema = z.object({
  reason: z
    .string({ invalid_type_error: 'Reason must be a text string' })
    .trim()
    .min(1, { message: 'Rejection reason cannot be empty if provided' })
    .max(1000, { message: 'Rejection reason cannot exceed 1000 characters' })
    .optional(),
});

/**
 * Validation schema for assigning officer department: PATCH /api/v1/admin/officers/:officerId/department
 */
export const assignOfficerDepartmentSchema = z.object({
  department_id: z.string().uuid({
    message: 'Invalid Department ID format. Must be a valid UUID.',
  }),
});

export type ListOfficersQueryInput = z.infer<typeof listOfficersQuerySchema>;
export type OfficerIdParamInput = z.infer<typeof officerIdParamSchema>;
export type DepartmentIdParamInput = z.infer<typeof departmentIdParamSchema>;
export type RejectOfficerInput = z.infer<typeof rejectOfficerSchema>;
export type AssignOfficerDepartmentInput = z.infer<typeof assignOfficerDepartmentSchema>;
