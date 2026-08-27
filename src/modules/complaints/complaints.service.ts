import { ComplaintStatus, Priority, Role } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ForbiddenError, NotFoundError } from '../../utils/apiError.js';
import { saveBase64Image } from '../../utils/fileStorage.js';
import { SafeUser } from '../auth/auth.service.js';
import { DepartmentsService } from '../departments/departments.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CreateComplaintInput, MyComplaintsQueryInput } from './complaints.schema.js';
import { PriorityService } from './priority.service.js';
import { DuplicateDetectorService, PotentialDuplicateSummary } from './duplicateDetector.service.js';
import { ComplaintSlaService, ComplaintSlaInfo } from './sla.service.js';

export interface FormattedComplaintSummary {
  id: string;
  complaint_number: string;
  title: string;
  department: {
    id: string;
    name: string;
  };
  office: {
    id: string;
    name: string;
    address: string;
  } | null;
  photo_url: string | null;
  priority: Priority;
  status: ComplaintStatus;
  created_at: Date;
  updated_at: Date;
}

export interface PaginatedComplaintsResponse {
  complaints: FormattedComplaintSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface FormattedComplaintDetail {
  id: string;
  complaint_number: string;
  title: string;
  description: string;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  priority: Priority;
  status: ComplaintStatus;
  sla?: ComplaintSlaInfo;
  possible_duplicate?: boolean;
  duplicate_count?: number;
  potential_duplicates?: PotentialDuplicateSummary[];
  priority_reason?: string;
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
  citizen: {
    id: string;
    name: string;
    email: string;
  };
  created_at: Date;
  updated_at: Date;
  assignments?: Array<{
    id: string;
    officer_id: string;
    officer_name: string;
    designation: string;
    assigned_at: Date;
  }>;
  assigned_officer?: {
    id: string;
    officer_id: string;
    officer_name: string;
    designation: string;
    assigned_at: Date;
  } | null;
  status_history: Array<{
    id: string;
    status: ComplaintStatus;
    note: string | null;
    created_at: Date;
  }>;
  resolution: {
    id: string;
    photo_url: string | null;
    note: string;
    resolved_at: Date;
    created_at: Date;
    officer?: {
      id: string;
      designation: string;
      name: string;
    } | null;
  } | null;
}

/**
 * Deterministically generates a unique human-readable complaint tracking identifier.
 * Format: CIV-100001 (or CIV-######)
 *
 * @param uuid Unique complaint UUID from database
 * @returns Human-readable complaint ID string
 */
export function generateComplaintNumber(uuid: string): string {
  const cleanHex = uuid.replace(/-/g, '');
  const hexPart = cleanHex.slice(-8);
  const intVal = parseInt(hexPart, 16) || 100001;
  const code = (Math.abs(intVal) % 900000) + 100000;
  return `CIV-${code}`;
}

export class ComplaintsService {
  /**
   * Submit and persist a new civic complaint for an authenticated citizen
   */
  public static async createComplaint(
    citizen: SafeUser,
    input: CreateComplaintInput
  ): Promise<FormattedComplaintDetail> {
    if (citizen.role !== Role.CITIZEN) {
      throw new ForbiddenError(
        `Access denied. Only citizens can file complaints. Current role: "${citizen.role}"`
      );
    }

    // 1. Department Validation
    const department = await prisma.department.findUnique({
      where: { id: input.department_id },
    });

    if (!department || !department.active) {
      throw new NotFoundError(
        `Department with ID "${input.department_id}" not found or is currently inactive`
      );
    }

    // 2. Photo Processing & Validation
    let finalPhotoUrl: string | null = null;
    const photoPayload = input.photo || input.photo_url;

    if (photoPayload) {
      if (
        photoPayload.startsWith('data:image/') ||
        (!photoPayload.startsWith('http://') &&
          !photoPayload.startsWith('https://') &&
          !photoPayload.startsWith('/uploads/'))
      ) {
        // Base64 payload or Data URI -> Save securely
        const stored = await saveBase64Image(photoPayload, 'complaints');
        finalPhotoUrl = stored.urlPath;
      } else {
        // Valid existing URL string
        finalPhotoUrl = photoPayload;
      }
    }

    // 3. Location & Nearest-Office Spatial Routing
    let officeId: string | null = null;
    if (
      input.latitude !== undefined &&
      input.latitude !== null &&
      input.longitude !== undefined &&
      input.longitude !== null
    ) {
      try {
        const nearestResult = await DepartmentsService.findNearestDepartmentOffice(
          input.department_id,
          input.latitude,
          input.longitude
        );
        officeId = nearestResult.office.id;
      } catch (err: any) {
        // If department has no active offices registered, allow office_id to remain null
        if (err instanceof NotFoundError) {
          officeId = null;
        } else {
          throw err;
        }
      }
    }

    // 4. Calculate deterministic priority & detect potential duplicates
    const calculatedPriority = PriorityService.calculatePriority(
      input.title,
      input.description,
      department.name
    );

    const duplicateCheck = await DuplicateDetectorService.findPotentialDuplicates(
      input.department_id,
      input.latitude,
      input.longitude,
      input.title,
      input.description
    );

    // 5. Persistence with Atomic Status History Log
    const createdComplaint = await prisma.$transaction(async (tx) => {
      const complaint = await tx.complaint.create({
        data: {
          citizen_id: citizen.id, // Strictly sourced from authenticated session
          department_id: input.department_id,
          office_id: officeId,
          title: input.title,
          description: input.description,
          photo_url: finalPhotoUrl,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          priority: calculatedPriority.priority, // Calculated deterministic priority
          status: ComplaintStatus.NEW, // Strict default: NEW
        },
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
          citizen: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Create initial Status History record
      await tx.complaintStatusHistory.create({
        data: {
          complaint_id: complaint.id,
          status: ComplaintStatus.NEW,
          changed_by: citizen.id,
          note: 'Complaint registered by citizen.',
        },
      });

      // Dispatch notifications to citizen and department officers
      await NotificationsService.notifyComplaintCreated(
        complaint.id,
        citizen.id,
        complaint.department_id,
        complaint.department.name,
        complaint.title,
        tx
      );

      return complaint;
    });

    return {
      id: createdComplaint.id,
      complaint_number: generateComplaintNumber(createdComplaint.id),
      title: createdComplaint.title,
      description: createdComplaint.description,
      photo_url: createdComplaint.photo_url,
      latitude: createdComplaint.latitude,
      longitude: createdComplaint.longitude,
      priority: createdComplaint.priority,
      priority_reason: calculatedPriority.reason,
      possible_duplicate: duplicateCheck.possible_duplicate,
      duplicate_count: duplicateCheck.duplicate_count,
      potential_duplicates: duplicateCheck.potential_duplicates,
      status: createdComplaint.status,
      department: {
        id: createdComplaint.department.id,
        name: createdComplaint.department.name,
        description: createdComplaint.department.description,
      },
      office: createdComplaint.office
        ? {
            id: createdComplaint.office.id,
            name: createdComplaint.office.name,
            address: createdComplaint.office.address,
            latitude: createdComplaint.office.latitude,
            longitude: createdComplaint.office.longitude,
          }
        : null,
      citizen: {
        id: createdComplaint.citizen.id,
        name: createdComplaint.citizen.name,
        email: createdComplaint.citizen.email,
      },
      created_at: createdComplaint.created_at,
      updated_at: createdComplaint.updated_at,
      status_history: [
        {
          id: 'initial',
          status: ComplaintStatus.NEW,
          note: 'Complaint registered by citizen.',
          created_at: createdComplaint.created_at,
        },
      ],
      resolution: null,
    };
  }

  /**
   * Retrieve complaints submitted by the authenticated citizen with pagination and filters
   */
  public static async getMyComplaints(
    citizen: SafeUser,
    query: MyComplaintsQueryInput
  ): Promise<PaginatedComplaintsResponse> {
    if (citizen.role !== Role.CITIZEN) {
      throw new ForbiddenError(
        `Access denied. Only citizens can access personal complaints. Current role: "${citizen.role}"`
      );
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const where: any = {
      citizen_id: citizen.id, // Strictly scoped to authenticated citizen identity
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.department_id) {
      where.department_id = query.department_id;
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
        },
      }),
    ]);

    const formattedList: FormattedComplaintSummary[] = records.map((c) => ({
      id: c.id,
      complaint_number: generateComplaintNumber(c.id),
      title: c.title,
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
      photo_url: c.photo_url,
      priority: c.priority,
      status: c.status,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));

    return {
      complaints: formattedList,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieve single complaint details by ID, enforcing citizen ownership
   */
  public static async getComplaintById(
    user: SafeUser,
    complaintId: string
  ): Promise<FormattedComplaintDetail> {
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
        citizen: {
          select: {
            id: true,
            name: true,
            email: true,
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
            assigned_at: 'desc',
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
        resolution: {
          select: {
            id: true,
            photo_url: true,
            note: true,
            resolved_at: true,
            created_at: true,
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
        },
      },
    });

    if (!complaint) {
      throw new NotFoundError(`Complaint with ID "${complaintId}" not found`);
    }

    // Role-based Access Enforcement:
    // - CITIZENS can ONLY view complaints they filed
    if (user.role === Role.CITIZEN && complaint.citizen_id !== user.id) {
      throw new ForbiddenError(
        'Access denied: You do not have permission to view this complaint.'
      );
    }

    // - OFFICERS can ONLY view complaints belonging to their assigned department
    if (user.role === Role.OFFICER) {
      if (!user.officer_profile || user.officer_profile.verification_status !== 'APPROVED') {
        throw new ForbiddenError('Officer account must be approved before viewing complaints.');
      }
      if (user.officer_profile.department_id !== complaint.department_id) {
        throw new ForbiddenError(
          'Access denied: You do not have permission to view complaints belonging to another department.'
        );
      }
    }

    const slaInfo = ComplaintSlaService.calculateSlaStatus(
      complaint.created_at,
      complaint.status,
      complaint.priority,
      complaint.resolution?.resolved_at
    );

    const assignmentsList = complaint.assignments.map((a) => ({
      id: a.id,
      officer_id: a.officer_id,
      officer_name: a.officer.user.name,
      designation: a.officer.designation,
      assigned_at: a.assigned_at,
    }));

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
      sla: slaInfo,
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
      citizen: {
        id: complaint.citizen.id,
        name: complaint.citizen.name,
        email: complaint.citizen.email,
      },
      assignments: assignmentsList,
      assigned_officer: assignmentsList[0] || null,
      created_at: complaint.created_at,
      updated_at: complaint.updated_at,
      status_history: complaint.status_history.map((h) => ({
        id: h.id,
        status: h.status,
        note: h.note,
        created_at: h.created_at,
      })),
      resolution: complaint.resolution
        ? {
            id: complaint.resolution.id,
            photo_url: complaint.resolution.photo_url,
            note: complaint.resolution.note,
            resolved_at: complaint.resolution.resolved_at,
            created_at: complaint.resolution.created_at,
            officer: complaint.resolution.officer
              ? {
                  id: complaint.resolution.officer.id,
                  designation: complaint.resolution.officer.designation,
                  name: complaint.resolution.officer.user.name,
                }
              : null,
          }
        : null,
    };
  }
}
