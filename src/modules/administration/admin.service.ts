import { ComplaintStatus, Prisma, VerificationStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { BadRequestError, NotFoundError } from '../../utils/apiError.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ListOfficersQueryInput, RejectOfficerInput } from './admin.schema.js';

export interface FormattedAdminOfficer {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  designation: string;
  department: {
    id: string;
    name: string;
    description: string | null;
    active: boolean;
  };
  verification_status: VerificationStatus;
  rejection_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PaginatedAdminOfficersResponse {
  officers: FormattedAdminOfficer[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface ComplaintsSummaryResponse {
  total_complaints: number;
  by_status: {
    new: number;
    assigned: number;
    in_progress: number;
    resolved: number;
  };
  by_department: Array<{
    department_id: string;
    department_name: string;
    count: number;
  }>;
}

export class AdminService {
  /**
   * Format raw Prisma OfficerProfile record for administrative responses
   */
  private static formatOfficer(profile: any): FormattedAdminOfficer {
    return {
      id: profile.id,
      user_id: profile.user_id,
      name: profile.user.name,
      email: profile.user.email,
      phone: profile.user.phone,
      designation: profile.designation,
      department: {
        id: profile.department.id,
        name: profile.department.name,
        description: profile.department.description,
        active: profile.department.active,
      },
      verification_status: profile.verification_status,
      rejection_reason: profile.rejection_reason ?? null,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
    };
  }

  /**
   * Helper: Find officer profile by OfficerProfile.id OR User.id
   */
  private static async findOfficerProfileByIdOrUserId(officerId: string) {
    const profile = await prisma.officerProfile.findFirst({
      where: {
        OR: [{ id: officerId }, { user_id: officerId }],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        department: true,
      },
    });

    return profile;
  }

  /**
   * List all officer registrations with optional verification status and department filters
   */
  public static async listOfficers(
    query: ListOfficersQueryInput
  ): Promise<PaginatedAdminOfficersResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.OfficerProfileWhereInput = {};

    if (query.verification_status) {
      where.verification_status = query.verification_status;
    }

    if (query.department_id) {
      where.department_id = query.department_id;
    }

    const [total, records] = await Promise.all([
      prisma.officerProfile.count({ where }),
      prisma.officerProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          created_at: 'desc',
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
            },
          },
          department: true,
        },
      }),
    ]);

    return {
      officers: records.map(this.formatOfficer),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get detailed officer profile by ID
   */
  public static async getOfficerById(officerId: string): Promise<FormattedAdminOfficer> {
    const profile = await this.findOfficerProfileByIdOrUserId(officerId);

    if (!profile) {
      throw new NotFoundError(`Officer with ID "${officerId}" not found`);
    }

    return this.formatOfficer(profile);
  }

  /**
   * Approve officer registration (PENDING -> APPROVED or REJECTED -> APPROVED)
   */
  public static async approveOfficer(officerId: string): Promise<FormattedAdminOfficer> {
    const existing = await this.findOfficerProfileByIdOrUserId(officerId);

    if (!existing) {
      throw new NotFoundError(`Officer with ID "${officerId}" not found`);
    }

    const updated = await prisma.officerProfile.update({
      where: { id: existing.id },
      data: {
        verification_status: VerificationStatus.APPROVED,
        rejection_reason: null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        department: true,
      },
    });

    // Send OFFICER_APPROVED in-app notification
    await NotificationsService.notifyOfficerApproved(updated.user_id);

    return this.formatOfficer(updated);
  }

  /**
   * Reject officer registration
   */
  public static async rejectOfficer(
    officerId: string,
    input: RejectOfficerInput
  ): Promise<FormattedAdminOfficer> {
    const existing = await this.findOfficerProfileByIdOrUserId(officerId);

    if (!existing) {
      throw new NotFoundError(`Officer with ID "${officerId}" not found`);
    }

    const reason = input.reason?.trim() || null;

    const updated = await prisma.officerProfile.update({
      where: { id: existing.id },
      data: {
        verification_status: VerificationStatus.REJECTED,
        rejection_reason: reason,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        department: true,
      },
    });

    // Send OFFICER_REJECTED in-app notification
    await NotificationsService.notifyOfficerRejected(
      updated.user_id,
      reason ?? undefined
    );

    return this.formatOfficer(updated);
  }

  /**
   * Assign or update an officer's assigned department
   */
  public static async assignOfficerDepartment(
    officerId: string,
    departmentId: string
  ): Promise<FormattedAdminOfficer> {
    // 1. Verify target department exists and is active
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department) {
      throw new NotFoundError(`Department with ID "${departmentId}" not found`);
    }

    if (!department.active) {
      throw new BadRequestError(
        `Department "${department.name}" is inactive. Cannot assign officers to an inactive department.`
      );
    }

    // 2. Verify officer exists
    const existing = await this.findOfficerProfileByIdOrUserId(officerId);

    if (!existing) {
      throw new NotFoundError(`Officer with ID "${officerId}" not found`);
    }

    // 3. Update department assignment
    const updated = await prisma.officerProfile.update({
      where: { id: existing.id },
      data: {
        department_id: departmentId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        department: true,
      },
    });

    return this.formatOfficer(updated);
  }

  /**
   * List officers belonging to a specific department
   */
  public static async listOfficersByDepartment(
    departmentId: string,
    query: ListOfficersQueryInput
  ): Promise<PaginatedAdminOfficersResponse> {
    // Verify department exists
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
    });

    if (!department) {
      throw new NotFoundError(`Department with ID "${departmentId}" not found`);
    }

    return this.listOfficers({
      ...query,
      department_id: departmentId,
    });
  }

  /**
   * Summary overview of complaints across statuses and departments for admin analytics
   */
  public static async getComplaintsSummary(): Promise<ComplaintsSummaryResponse> {
    const [total, newCount, assignedCount, inProgressCount, resolvedCount, departments] =
      await Promise.all([
        prisma.complaint.count(),
        prisma.complaint.count({ where: { status: ComplaintStatus.NEW } }),
        prisma.complaint.count({ where: { status: ComplaintStatus.ASSIGNED } }),
        prisma.complaint.count({ where: { status: ComplaintStatus.IN_PROGRESS } }),
        prisma.complaint.count({ where: { status: ComplaintStatus.RESOLVED } }),
        prisma.department.findMany({
          select: {
            id: true,
            name: true,
            _count: {
              select: {
                complaints: true,
              },
            },
          },
          orderBy: {
            name: 'asc',
          },
        }),
      ]);

    return {
      total_complaints: total,
      by_status: {
        new: newCount,
        assigned: assignedCount,
        in_progress: inProgressCount,
        resolved: resolvedCount,
      },
      by_department: departments.map((d) => ({
        department_id: d.id,
        department_name: d.name,
        count: d._count.complaints,
      })),
    };
  }
}
