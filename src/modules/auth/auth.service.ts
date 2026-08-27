import { Role, VerificationStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database.js';
import { config } from '../../config/env.config.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../utils/apiError.js';
import {
  CitizenRegisterInput,
  LoginInput,
  OfficerRegisterInput,
} from './auth.schema.js';

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
  officerProfileId?: string;
  departmentId?: string;
}

export interface SafeOfficerProfile {
  id: string;
  department_id: string;
  designation: string;
  verification_status: VerificationStatus;
  department?: {
    id: string;
    name: string;
    description: string | null;
  };
  created_at: Date;
  updated_at: Date;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  is_blocked: boolean;
  created_at: Date;
  updated_at: Date;
  officer_profile?: SafeOfficerProfile | null;
}

export interface AuthResponse {
  user: SafeUser;
  token: string;
}

export class AuthService {
  /**
   * Strip sensitive fields (e.g. password_hash) from user record
   */
  public static sanitizeUser(user: any): SafeUser {
    const safeUser: SafeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      role: user.role,
      is_blocked: user.is_blocked ?? false,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };

    if (user.officer_profile) {
      safeUser.officer_profile = {
        id: user.officer_profile.id,
        department_id: user.officer_profile.department_id,
        designation: user.officer_profile.designation,
        verification_status: user.officer_profile.verification_status,
        department: user.officer_profile.department
          ? {
              id: user.officer_profile.department.id,
              name: user.officer_profile.department.name,
              description: user.officer_profile.department.description ?? null,
            }
          : undefined,
        created_at: user.officer_profile.created_at,
        updated_at: user.officer_profile.updated_at,
      };
    }

    return safeUser;
  }

  /**
   * Generate a signed JWT token for an authenticated user
   */
  public static generateToken(payload: JwtPayload): string {
    return jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    } as jwt.SignOptions);
  }

  /**
   * Verify and decode a JWT token
   */
  public static verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, config.jwtSecret) as JwtPayload;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Authentication token has expired');
      }
      throw new UnauthorizedError('Invalid authentication token');
    }
  }

  /**
   * Register a new Citizen account
   */
  public static async registerCitizen(input: CitizenRegisterInput): Promise<AuthResponse> {
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new ConflictError('An account with this email address already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const newUser = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        password_hash: passwordHash,
        role: Role.CITIZEN,
      },
    });

    const token = this.generateToken({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });

    return {
      user: this.sanitizeUser(newUser),
      token,
    };
  }

  /**
   * Register a new Officer account (status = PENDING)
   */
  public static async registerOfficer(
    input: OfficerRegisterInput
  ): Promise<{ user: SafeUser; message: string }> {
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new ConflictError('An account with this email address already exists');
    }

    const department = await prisma.department.findUnique({
      where: { id: input.department_id },
    });

    if (!department) {
      throw new NotFoundError(`Department with ID "${input.department_id}" not found`);
    }

    if (!department.active) {
      throw new BadRequestError(`Department "${department.name}" is currently inactive`);
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const createdUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone || null,
          password_hash: passwordHash,
          role: Role.OFFICER,
        },
      });

      const officerProfile = await tx.officerProfile.create({
        data: {
          user_id: user.id,
          department_id: input.department_id,
          designation: input.designation,
          verification_status: VerificationStatus.PENDING,
        },
        include: {
          department: true,
        },
      });

      return {
        ...user,
        officer_profile: officerProfile,
      };
    });

    return {
      user: this.sanitizeUser(createdUser),
      message:
        'Officer account registered successfully. Verification is pending administrative approval.',
    };
  }

  /**
   * Authenticate a user (Citizen, Approved Officer, Admin)
   */
  public static async login(input: LoginInput): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        officer_profile: {
          include: {
            department: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (user.is_blocked) {
      throw new ForbiddenError(
        'Your account has been blocked by administration. Access denied.'
      );
    }

    // Role-specific verification checks for Officers
    if (user.role === Role.OFFICER) {
      if (!user.officer_profile) {
        throw new ForbiddenError(
          'Officer profile record not found. Please contact administration.'
        );
      }

      if (user.officer_profile.verification_status === VerificationStatus.PENDING) {
        throw new ForbiddenError(
          'Officer account is pending administrative approval. Access denied.'
        );
      }

      if (user.officer_profile.verification_status === VerificationStatus.REJECTED) {
        throw new ForbiddenError(
          'Officer account registration has been rejected by administration. Access denied.'
        );
      }
    }

    const tokenPayload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      officerProfileId: user.officer_profile?.id,
      departmentId: user.officer_profile?.department_id,
    };

    const token = this.generateToken(tokenPayload);

    return {
      user: this.sanitizeUser(user),
      token,
    };
  }

  /**
   * Get user profile by user ID
   */
  public static async getMe(userId: string): Promise<SafeUser> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        officer_profile: {
          include: {
            department: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User account not found');
    }

    return this.sanitizeUser(user);
  }
}
