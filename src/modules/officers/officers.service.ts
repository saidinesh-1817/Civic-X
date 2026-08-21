import { ComplaintStatus, Priority, Role, VerificationStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/apiError.js';
import { SafeUser } from '../auth/auth.service.js';
import { generateComplaintNumber } from '../complaints/complaints.service.js';
import { AssignComplaintInput, OfficerComplaintsQueryInput } from './officers.schema.js';

export interface FormattedOfficerComplaintSummary {
  id: string;
  complaint_number: string;
  title: string;
  description: string;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  priority: Priority;
  status: ComplaintStatus;
  department: {
    id: string;
    name: string;
  };
  office: {
    id: string;
    name: string;
    address: string;
  } | null;
  created_at: Date;
  updated_at: Date;
  assignment: {
    id: string;
    officer_id: string;
    officer_name: string;
    designation: string;
    assigned_at: Date;
  } | null;
}

export interface PaginatedOfficerComplaintsResponse {
  complaints: FormattedOfficerComplaintSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface FormattedOfficerComplaintDetail {
  id: string;
  complaint_number: string;
  title: string;
  description: string;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  priority: Priority;
  status: ComplaintStatus;
  department: {
    id: string;
    name: string;
    description: string | null;
  };
  office: {
    id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  } | null;
  created_at: Date;
  updated_at: Date;
  status_history: Array<{
    id: string;
    status: ComplaintStatus;
    note: string | null;
    created_at: Date;
  }>;
  assignments: Array<{
    id: string;
    officer_id: string;
    officer_name: string;
    designation: string;
    assigned_at: Date;
  }>;
  resolution: {
    id: string;
    photo_url: string | null;
    note: string;
    resolved_at: Date;
    created_at: Date;
  } | null;
}

export class OfficersService {
  /**
   * Helper to ensure the caller is an approved officer and retrieve their department ID
   */
  private static getApprovedOfficerContext(officer: SafeUser): {
    officerProfileId: string;
    departmentId: string;
  } {
    if (officer.role !== Role.OFFICER || !officer.officer_profile) {
      throw new ForbiddenError(
        `Access denied. User role "${officer.role}" is not authorized for officer operations.`
      );
    }

    if (officer.officer_profile.verification_status !== VerificationStatus.APPROVED) {
      throw new ForbiddenError(
        `Officer account is currently ${officer.officer_profile.verification_status}. Access to protected resources is restricted.`
      );
    }

    return {
      officerProfileId: officer.officer_profile.id,
      departmentId: officer.officer_profile.department_id,
    };
  }

  /**
   * Retrieve complaints assigned to the officer's department with filters and pagination
   */
  public static async getDepartmentComplaints(
    officer: SafeUser,
    query: OfficerComplaintsQueryInput
  ): Promise<PaginatedOfficerComplaintsResponse> {
    const { departmentId } = this.getApprovedOfficerContext(officer);

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const where: any = {
      department_id: departmentId, // Strictly scoped to authenticated officer's department
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.office_id) {
      where.office_id = query.office_id;
    }

    if (query.from_date || query.to_date) {
      where.created_at = {};
      if (query.from_date) {
        where.created_at.gte = new Date(query.from_date);
      }
      if (query.to_date) {
        where.created_at.lte = new Date(query.to_date);
      }
    }

    const [total, records] = await Promise.all([
      prisma.complaint.count({ where }),
      prisma.complaint.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          department: {
            select: {
              id: true,
              name: true,
            },
          },
          office: {
            select: {
              id: true,
              name: true,
              address: true,
            },
          },
          assignments: {
            select: {
              id: true,
              officer_id: true,
              assigned_at: true,
              officer: {
                select: {
                  id: true,
                  designation: true,
                  user: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                    },
                  },
                },
              },
            },
            orderBy: { assigned_at: 'desc' },
            take: 1,
          },
        },
      }),
    ]);

    const formattedComplaints: FormattedOfficerComplaintSummary[] = records.map((c) => {
      const latestAssignment = c.assignments[0] || null;
      return {
        id: c.id,
        complaint_number: generateComplaintNumber(c.id),
        title: c.title,
        description: c.description,
        photo_url: c.photo_url,
        latitude: c.latitude,
        longitude: c.longitude,
        priority: c.priority,
        status: c.status,
        department: {
          id: c.department.id,
          name: c.department.name,
        },
        office: c.office
          ? {
              id: c.office.id,
              name: c.office.name,
              address: c.office.address,
            }
          : null,
        created_at: c.created_at,
        updated_at: c.updated_at,
        assignment: latestAssignment
          ? {
              id: latestAssignment.id,
              officer_id: latestAssignment.officer_id,
              officer_name: latestAssignment.officer.user.name,
              designation: latestAssignment.officer.designation,
              assigned_at: latestAssignment.assigned_at,
            }
          : null,
      };
    });

    return {
      complaints: formattedComplaints,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieve single complaint details by ID, enforcing officer department boundary
   */
  public static async getDepartmentComplaintById(
    officer: SafeUser,
    complaintId: string
  ): Promise<FormattedOfficerComplaintDetail> {
    const { departmentId } = this.getApprovedOfficerContext(officer);

    const complaint = await prisma.complaint.findUnique({
      where: { id: complaintId },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
        office: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
        status_history: {
          select: {
            id: true,
            status: true,
            note: true,
            created_at: true,
          },
          orderBy: {
            created_at: 'asc',
          },
        },
        assignments: {
          select: {
            id: true,
            officer_id: true,
            assigned_at: true,
            officer: {
              select: {
                id: true,
                designation: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
          orderBy: {
            assigned_at: 'asc',
          },
        },
        resolution: {
          select: {
            id: true,
            photo_url: true,
            note: true,
            resolved_at: true,
            created_at: true,
          },
        },
      },
    });

    if (!complaint) {
      throw new NotFoundError(`Complaint with ID "${complaintId}" not found`);
    }

    // Department boundary enforcement
    if (complaint.department_id !== departmentId) {
      throw new ForbiddenError(
        'Access denied: You do not have permission to view complaints belonging to another department.'
      );
    }

    return {
      id: complaint.id,
      complaint_number: generateComplaintNumber(complaint.id),
      title: complaint.title,
      description: complaint.description,
      photo_url: complaint.photo_url,
      latitude: complaint.latitude,
      longitude: complaint.longitude,
      priority: complaint.priority,
      status: complaint.status,
      department: {
        id: complaint.department.id,
        name: complaint.department.name,
        description: complaint.department.description,
      },
      office: complaint.office
        ? {
            id: complaint.office.id,
            name: complaint.office.name,
            address: complaint.office.address,
            latitude: complaint.office.latitude,
            longitude: complaint.office.longitude,
          }
        : null,
      created_at: complaint.created_at,
      updated_at: complaint.updated_at,
      status_history: complaint.status_history.map((h) => ({
        id: h.id,
        status: h.status,
        note: h.note,
        created_at: h.created_at,
      })),
      assignments: complaint.assignments.map((a) => ({
        id: a.id,
        officer_id: a.officer_id,
        officer_name: a.officer.user.name,
        designation: a.officer.designation,
        assigned_at: a.assigned_at,
      })),
      resolution: complaint.resolution
        ? {
            id: complaint.resolution.id,
            photo_url: complaint.resolution.photo_url,
            note: complaint.resolution.note,
            resolved_at: complaint.resolution.resolved_at,
            created_at: complaint.resolution.created_at,
          }
        : null,
    };
  }

  /**
   * Accept and assign a NEW complaint to the authenticated officer
   */
  public static async assignComplaint(
    officer: SafeUser,
    complaintId: string,
    input: AssignComplaintInput
  ): Promise<FormattedOfficerComplaintDetail> {
    const { officerProfileId, departmentId } = this.getApprovedOfficerContext(officer);

    const complaint = await prisma.complaint.findUnique({
      where: { id: complaintId },
      include: {
        department: true,
      },
    });

    if (!complaint) {
      throw new NotFoundError(`Complaint with ID "${complaintId}" not found`);
    }

    // Department boundary enforcement
    if (complaint.department_id !== departmentId) {
      throw new ForbiddenError(
        'Access denied: You cannot accept complaints belonging to another department.'
      );
    }

    // Status transition validation: NEW -> ASSIGNED
    if (complaint.status !== ComplaintStatus.NEW) {
      throw new BadRequestError(
        `Complaint cannot be accepted because it is currently in "${complaint.status}" status (only "NEW" complaints can be accepted).`
      );
    }

    // Atomic transaction: Update complaint + Create assignment + Create status history
    await prisma.$transaction(async (tx) => {
      // 1. Update complaint status
      await tx.complaint.update({
        where: { id: complaint.id },
        data: {
          status: ComplaintStatus.ASSIGNED,
        },
      });

      // 2. Create Assignment record
      await tx.complaintAssignment.create({
        data: {
          complaint_id: complaint.id,
          officer_id: officerProfileId,
          assigned_by: officer.id,
          assigned_at: new Date(),
        },
      });

      // 3. Create Status History log
      await tx.complaintStatusHistory.create({
        data: {
          complaint_id: complaint.id,
          status: ComplaintStatus.ASSIGNED,
          changed_by: officer.id,
          note: input.note || `Complaint accepted by officer ${officer.name}.`,
        },
      });
    });

    return this.getDepartmentComplaintById(officer, complaintId);
  }
}
