import { z } from 'zod';

// Password complexity regex: at least 8 chars, 1 uppercase, 1 lowercase, 1 digit
const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// Citizen Registration Validation Schema
export const citizenRegisterSchema = z.object({
  name: z
    .string({ required_error: 'Full name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters long')
    .max(100, 'Name must not exceed 100 characters'),
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Invalid email address format')
    .max(255, 'Email must not exceed 255 characters'),
  phone: z
    .string()
    .trim()
    .min(7, 'Phone number must be at least 7 characters long')
    .max(20, 'Phone number must not exceed 20 characters')
    .optional(),
  password: passwordSchema,
});

export type CitizenRegisterInput = z.infer<typeof citizenRegisterSchema>;

// Officer Registration Validation Schema
export const officerRegisterSchema = z.object({
  name: z
    .string({ required_error: 'Full name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters long')
    .max(100, 'Name must not exceed 100 characters'),
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Invalid email address format')
    .max(255, 'Email must not exceed 255 characters'),
  phone: z
    .string()
    .trim()
    .min(7, 'Phone number must be at least 7 characters long')
    .max(20, 'Phone number must not exceed 20 characters')
    .optional(),
  password: passwordSchema,
  department_id: z
    .string({ required_error: 'Department ID is required' })
    .uuid('Department ID must be a valid UUID'),
  designation: z
    .string({ required_error: 'Designation is required' })
    .trim()
    .min(2, 'Designation must be at least 2 characters long')
    .max(100, 'Designation must not exceed 100 characters'),
});

export type OfficerRegisterInput = z.infer<typeof officerRegisterSchema>;

// Universal Login Validation Schema
export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .toLowerCase()
    .email('Invalid email address format'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
