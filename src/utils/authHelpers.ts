import { Request } from 'express';
import { Role, VerificationStatus } from '@prisma/client';
import { SafeOfficerProfile, SafeUser } from '../modules/auth/auth.service.js';
import { ForbiddenError, UnauthorizedError } from './apiError.js';

/**
 * Extracts and asserts the presence of the authenticated user from Express Request.
 * Sourced strictly from server-side JWT verification.
 * 
 * @param req Express Request
 * @returns SafeUser
 * @throws UnauthorizedError if user is not authenticated
 */
export function getAuthenticatedUser(req: Request): SafeUser {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }
  return req.user;
}

/**
 * Asserts that the authenticated user is an Officer with APPROVED verification status.
 * 
 * @param user SafeUser
 * @returns SafeOfficerProfile
 * @throws ForbiddenError if user is not an approved officer
 */
export function requireApprovedOfficer(user: SafeUser): SafeOfficerProfile {
  if (user.role !== Role.OFFICER) {
    throw new ForbiddenError(`Access denied. Role "${user.role}" is not authorized for officer operations.`);
  }

  if (!user.officer_profile) {
    throw new ForbiddenError('Officer profile record not found');
  }

  if (user.officer_profile.verification_status !== VerificationStatus.APPROVED) {
    throw new ForbiddenError(
      `Officer account is currently ${user.officer_profile.verification_status}. Approved status is required.`
    );
  }

  return user.officer_profile;
}

/**
 * Verifies if an authenticated user has authorization to access a specific department's resources.
 * - ADMIN: Granted cross-department access.
 * - OFFICER (APPROVED): Granted access ONLY if officer_profile.department_id matches targetDepartmentId.
 * - CITIZEN / Others: Denied access.
 * 
 * @param user SafeUser
 * @param targetDepartmentId Target department UUID
 * @returns boolean
 */
export function checkDepartmentAccess(user: SafeUser, targetDepartmentId: string): boolean {
  if (user.role === Role.ADMIN) {
    return true;
  }

  if (user.role === Role.OFFICER) {
    if (user.officer_profile?.verification_status !== VerificationStatus.APPROVED) {
      return false;
    }
    return user.officer_profile.department_id === targetDepartmentId;
  }

  return false;
}

/**
 * Asserts department access or throws ForbiddenError.
 * 
 * @param user SafeUser
 * @param targetDepartmentId Target department UUID
 * @throws ForbiddenError
 */
export function assertDepartmentAccess(user: SafeUser, targetDepartmentId: string): void {
  if (!checkDepartmentAccess(user, targetDepartmentId)) {
    throw new ForbiddenError('Access denied: You do not have permission to access resources in this department.');
  }
}

/**
 * Verifies if an authenticated user owns a specific resource (or has administrative override).
 * - ADMIN: Granted access.
 * - CITIZEN / USER: Granted access if user.id matches resourceOwnerId.
 * 
 * @param user SafeUser
 * @param resourceOwnerId Target resource owner user ID
 * @returns boolean
 */
export function checkResourceOwner(user: SafeUser, resourceOwnerId: string): boolean {
  if (user.role === Role.ADMIN) {
    return true;
  }

  return user.id === resourceOwnerId;
}

/**
 * Asserts resource ownership or throws ForbiddenError.
 * 
 * @param user SafeUser
 * @param resourceOwnerId Target resource owner user ID
 * @throws ForbiddenError
 */
export function assertResourceOwner(user: SafeUser, resourceOwnerId: string): void {
  if (!checkResourceOwner(user, resourceOwnerId)) {
    throw new ForbiddenError('Access denied: You can only access resources belonging to your own account.');
  }
}
