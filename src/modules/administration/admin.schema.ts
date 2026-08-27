import { Role, VerificationStatus } from '@prisma/client';
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
 * Validation schema for :userId URL parameter
 */
export const userIdParamSchema = z.object({
  userId: z.string().uuid({
    message: 'Invalid User ID format. Must be a valid UUID.',
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

/**
 * Validation schema for listing all complaints across system: GET /api/v1/admin/complaints
 */
export const listAdminComplaintsQuerySchema = z.object({
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
    .max(100, { message: 'Limit cannot exceed 100' })
    .optional()
    .default(20),
  status: z
    .enum(['ALL', 'NEW', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED'])
    .optional(),
  priority: z
    .enum(['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'Low', 'Medium', 'High', 'Critical'])
    .optional(),
  department: z.string().optional(),
  department_id: z.string().optional(),
  search: z.string().optional(),
});

/**
 * Validation schema for listing users: GET /api/v1/admin/users
 */
export const listUsersQuerySchema = z.object({
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
    .max(100, { message: 'Limit cannot exceed 100' })
    .optional()
    .default(20),
  role: z
    .nativeEnum(Role, {
      errorMap: () => ({
        message: `Invalid role. Allowed values: [${Object.values(Role).join(', ')}]`,
      }),
    })
    .optional(),
  is_blocked: z
    .preprocess((val) => {
      if (val === 'true' || val === true) return true;
      if (val === 'false' || val === false) return false;
      return undefined;
    }, z.boolean().optional())
    .optional(),
  search: z.string().optional(),
});

export type ListOfficersQueryInput = z.infer<typeof listOfficersQuerySchema>;
export type OfficerIdParamInput = z.infer<typeof officerIdParamSchema>;
export type UserIdParamInput = z.infer<typeof userIdParamSchema>;
export type DepartmentIdParamInput = z.infer<typeof departmentIdParamSchema>;
export type RejectOfficerInput = z.infer<typeof rejectOfficerSchema>;
export type AssignOfficerDepartmentInput = z.infer<typeof assignOfficerDepartmentSchema>;
export type ListAdminComplaintsQueryInput = z.infer<typeof listAdminComplaintsQuerySchema>;
export type ListUsersQueryInput = z.infer<typeof listUsersQuerySchema>;

