import { ComplaintStatus, Priority, Role, VerificationStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/apiError.js';
import { saveBase64Image } from '../../utils/fileStorage.js';
import { SafeUser } from '../auth/auth.service.js';
import { generateComplaintNumber } from '../complaints/complaints.service.js';
import {
  AssignComplaintInput,
  OfficerComplaintsQueryInput,
  ResolveComplaintInput,
  UpdateComplaintStatusInput,
} from './officers.schema.js';

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
  department: { id: string; name: string };
  office: { id: string; name: string; address: string } | null;
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
  pagination: { page: number; limit: number; total: number; total_pages: number };
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
  department: { id: string; name: string; description: string | null };
  office: { id: string; name: string; address: string; latitude: number; longitude: number } | null;
  created_at: Date;
  updated_at: Date;
  status_history: Array<{ id: string; status: ComplaintStatus; note: string | null; created_at: Date }>;
  assignments: Array<{ id: string; officer_id: string; officer_name: string; designation: string; assigned_at: Date }>;
  resolution: { id: string; photo_url: string | null; note: string; resolved_at: Date; created_at: Date } | null;
}

export class OfficersService {
  private static getApprovedOfficerContext(officer: SafeUser): { officerProfileId: string; departmentId: string } {
    if (officer.role !== Role.OFFICER || !officer.officer_profile) {
      throw new ForbiddenError(`Access denied. User role "${officer.role}" is not authorized for officer operations.`);
    }
    if (officer.officer_profile.verification_status !== VerificationStatus.APPROVED) {
      throw new ForbiddenError(
        `Officer account is currently ${officer.officer_profile.verification_status}. Access to protected resources is restricted.`
      );
    }
    return { officerProfileId: officer.officer_profile.id, departmentId: officer.officer_profile.department_id };
  }

  public static async getDepartmentComplaints(officer: SafeUser, query: OfficerComplaintsQueryInput): Promise<PaginatedOfficerComplaintsResponse> {
    const { departmentId } = this.getApprovedOfficerContext(officer);
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;
    const where: any = { department_id: departmentId };
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.office_id) where.office_id = query.office_id;
    if (query.from_date || query.to_date) {
      where.created_at = {};
      if (query.from_date) where.created_at.gte = new Date(query.from_date);
      if (query.to_date) where.created_at.lte = new Date(query.to_date);
    }

    const [total, records] = await Promise.all([
      prisma.complaint.count({ where }),
      prisma.complaint.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          department: { select: { id: true, name: true } },
          office: { select: { id: true, name: true, address: true } },
          assignments: {
            select: {
              id: true, officer_id: true, assigned_at: true,
              officer: { select: { id: true, designation: true, user: { select: { id: true, name: true, email: true } } } },
            },
            orderBy: { assigned_at: 'desc' }, take: 1,
          },
        },
      }),
    ]);

    const formattedComplaints = records.map((c) => {
      const latestAssignment = c.assignments[0] || null;
      return {
        id: c.id, complaint_number: generateComplaintNumber(c.id), title: c.title, description: c.description,
        photo_url: c.photo_url, latitude: c.latitude, longitude: c.longitude, priority: c.priority, status: c.status,
        department: c.department,
        office: c.office ? { id: c.office.id, name: c.office.name, address: c.office.address } : null,
        created_at: c.created_at, updated_at: c.updated_at,
        assignment: latestAssignment ? {
          id: latestAssignment.id, officer_id: latestAssignment.officer_id,
          officer_name: latestAssignment.officer.user.name, designation: latestAssignment.officer.designation,
          assigned_at: latestAssignment.assigned_at,
        } : null,
      };
    });

    return { complaints: formattedComplaints, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) || 1 } };
  }

  public static async getDepartmentComplaintById(officer: SafeUser, complaintId: string): Promise<FormattedOfficerComplaintDetail> {
    const { departmentId } = this.getApprovedOfficerContext(officer);
    const complaint = await prisma.complaint.findUnique({
      where: { id: complaintId },
      include: {
        department: { select: { id: true, name: true, description: true } },
        office: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
        status_history: { select: { id: true, status: true, note: true, created_at: true }, orderBy: { created_at: 'asc' } },
        assignments: {
          select: {
            id: true, officer_id: true, assigned_at: true,
            officer: { select: { id: true, designation: true, user: { select: { id: true, name: true, email: true } } } },
          },
          orderBy: { assigned_at: 'asc' },
        },
        resolution: { select: { id: true, photo_url: true, note: true, resolved_at: true, created_at: true } },
      },
    });
    if (!complaint) throw new NotFoundError(`Complaint with ID "${complaintId}" not found`);
    if (complaint.department_id !== departmentId) {
      throw new ForbiddenError('Access denied: You do not have permission to view complaints belonging to another department.');
    }
    return {
      id: complaint.id, complaint_number: generateComplaintNumber(complaint.id), title: complaint.title,
      description: complaint.description, photo_url: complaint.photo_url, latitude: complaint.latitude,
      longitude: complaint.longitude, priority: complaint.priority, status: complaint.status,
      department: complaint.department,
      office: complaint.office ? complaint.office : null,
      created_at: complaint.created_at, updated_at: complaint.updated_at,
      status_history: complaint.status_history,
      assignments: complaint.assignments.map((a) => ({
        id: a.id, officer_id: a.officer_id, officer_name: a.officer.user.name,
        designation: a.officer.designation, assigned_at: a.assigned_at,
      })),
      resolution: complaint.resolution,
    };
  }

  public static async assignComplaint(officer: SafeUser, complaintId: string, input: AssignComplaintInput): Promise<FormattedOfficerComplaintDetail> {
    const { officerProfileId, departmentId } = this.getApprovedOfficerContext(officer);

    await prisma.$transaction(async (tx) => {
      // The status predicate is part of the UPDATE, making acceptance atomic.
      // If two officers race, only one can change NEW -> ASSIGNED.
      const updated = await tx.complaint.updateMany({
        where: { id: complaintId, department_id: departmentId, status: ComplaintStatus.NEW },
        data: { status: ComplaintStatus.ASSIGNED },
      });

      if (updated.count !== 1) {
        const complaint = await tx.complaint.findUnique({ where: { id: complaintId }, select: { id: true, department_id: true, status: true } });
        if (!complaint) throw new NotFoundError(`Complaint with ID "${complaintId}" not found`);
        if (complaint.department_id !== departmentId) {
          throw new ForbiddenError('Access denied: You cannot accept complaints belonging to another department.');
        }
        throw new BadRequestError(
          `Complaint cannot be accepted because it is currently in "${complaint.status}" status (only "NEW" complaints can be accepted).`
        );
      }

      await tx.complaintAssignment.create({
        data: { complaint_id: complaintId, officer_id: officerProfileId, assigned_by: officer.id, assigned_at: new Date() },
      });

      await tx.complaintStatusHistory.create({
        data: {
          complaint_id: complaintId,
          status: ComplaintStatus.ASSIGNED,
          changed_by: officer.id,
          note: input.note || `Complaint accepted by officer ${officer.name}.`,
        },
      });
    });

    return this.getDepartmentComplaintById(officer, complaintId);
  }

  /**
   * Update complaint status to IN_PROGRESS (APPROVED OFFICER ONLY, MUST BE ASSIGNED TO COMPLAINT)
   */
  public static async updateComplaintStatus(
    officer: SafeUser,
    complaintId: string,
    input: UpdateComplaintStatusInput
  ): Promise<FormattedOfficerComplaintDetail> {
    const { officerProfileId, departmentId } = this.getApprovedOfficerContext(officer);

    // Validate that the requested status transition is allowed
    if (input.status !== ComplaintStatus.IN_PROGRESS) {
      throw new BadRequestError(
        `Invalid status transition: Only transitioning to "IN_PROGRESS" is allowed via this endpoint.`
      );
    }

    await prisma.$transaction(async (tx) => {
      // 1. Fetch complaint with current status, department, and assignments
      const complaint = await tx.complaint.findUnique({
        where: { id: complaintId },
        include: {
          assignments: {
            orderBy: { assigned_at: 'desc' },
          },
        },
      });

      if (!complaint) {
        throw new NotFoundError(`Complaint with ID "${complaintId}" not found`);
      }

      // 2. Department boundary check
      if (complaint.department_id !== departmentId) {
        throw new ForbiddenError(
          'Access denied: You do not have permission to modify complaints belonging to another department.'
        );
      }

      // 3. Officer assignment check
      const isAssigned = complaint.assignments.some(
        (a) => a.officer_id === officerProfileId
      );
      if (!isAssigned) {
        throw new ForbiddenError(
          'Access denied: You must be assigned to this complaint to update its status.'
        );
      }

      // 4. Status transition validation: Allowed transition: ASSIGNED -> IN_PROGRESS
      if (complaint.status === ComplaintStatus.IN_PROGRESS) {
        throw new BadRequestError('Complaint is already in "IN_PROGRESS" status.');
      }

      if (complaint.status !== ComplaintStatus.ASSIGNED) {
        throw new BadRequestError(
          `Invalid status transition: Cannot change status from "${complaint.status}" to "IN_PROGRESS". Complaint must be in "ASSIGNED" status before starting work.`
        );
      }

      // 5. Update complaint status
      await tx.complaint.update({
        where: { id: complaintId },
        data: {
          status: ComplaintStatus.IN_PROGRESS,
        },
      });

      // 6. Create Status History entry
      await tx.complaintStatusHistory.create({
        data: {
          complaint_id: complaintId,
          status: ComplaintStatus.IN_PROGRESS,
          changed_by: officer.id,
          note: input.note || 'Work has started on this issue.',
        },
      });
    });

    return this.getDepartmentComplaintById(officer, complaintId);
  }

  /**
   * Resolve complaint with evidence photo and note (APPROVED OFFICER ONLY, MUST BE ASSIGNED TO COMPLAINT)
   */
  public static async resolveComplaint(
    officer: SafeUser,
    complaintId: string,
    input: ResolveComplaintInput
  ): Promise<FormattedOfficerComplaintDetail> {
    const { officerProfileId, departmentId } = this.getApprovedOfficerContext(officer);

    // 1. Validate note and photo input
    const note = (input.note || input.resolution_note || '').trim();
    if (!note) {
      throw new BadRequestError('Resolution note is required');
    }

    const photoPayload =
      input.photo ||
      input.photo_url ||
      input.resolution_photo ||
      input.resolution_photo_url;

    if (!photoPayload || typeof photoPayload !== 'string' || !photoPayload.trim()) {
      throw new BadRequestError('Resolution photo is required');
    }

    // 2. Photo Processing & Validation (Stores photo securely in uploads/resolutions)
    let finalPhotoUrl: string;
    if (
      photoPayload.startsWith('data:image/') ||
      (!photoPayload.startsWith('http://') &&
        !photoPayload.startsWith('https://') &&
        !photoPayload.startsWith('/uploads/'))
    ) {
      const stored = await saveBase64Image(photoPayload, 'resolutions');
      finalPhotoUrl = stored.urlPath;
    } else {
      finalPhotoUrl = photoPayload;
    }

    await prisma.$transaction(async (tx) => {
      // 3. Fetch complaint with current status, department, assignments, and resolution
      const complaint = await tx.complaint.findUnique({
        where: { id: complaintId },
        include: {
          assignments: {
            orderBy: { assigned_at: 'desc' },
          },
          resolution: true,
        },
      });

      if (!complaint) {
        throw new NotFoundError(`Complaint with ID "${complaintId}" not found`);
      }

      // 4. Department boundary check
      if (complaint.department_id !== departmentId) {
        throw new ForbiddenError(
          'Access denied: You do not have permission to modify complaints belonging to another department.'
        );
      }

      // 5. Officer assignment check
      const isAssigned = complaint.assignments.some(
        (a) => a.officer_id === officerProfileId
      );
      if (!isAssigned) {
        throw new ForbiddenError(
          'Access denied: You must be assigned to this complaint to resolve it.'
        );
      }

      // 6. Status transition validation: Allowed transition: IN_PROGRESS -> RESOLVED
      if (complaint.status === ComplaintStatus.RESOLVED) {
        throw new BadRequestError(
          'Invalid status transition: Complaint is already "RESOLVED".'
        );
      }

      if (complaint.status !== ComplaintStatus.IN_PROGRESS) {
        throw new BadRequestError(
          `Invalid status transition: Cannot resolve complaint from "${complaint.status}" status. Complaint must be in "IN_PROGRESS" status before it can be resolved.`
        );
      }

      // 7. Update complaint status
      await tx.complaint.update({
        where: { id: complaintId },
        data: {
          status: ComplaintStatus.RESOLVED,
        },
      });

      // 8. Create Resolution record
      await tx.resolution.create({
        data: {
          complaint_id: complaintId,
          officer_id: officerProfileId,
          photo_url: finalPhotoUrl,
          note: note,
          resolved_at: new Date(),
        },
      });

      // 9. Create Status History entry
      await tx.complaintStatusHistory.create({
        data: {
          complaint_id: complaintId,
          status: ComplaintStatus.RESOLVED,
          changed_by: officer.id,
          note: note,
        },
      });
    });

    return this.getDepartmentComplaintById(officer, complaintId);
  }
}
