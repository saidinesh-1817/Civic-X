import { ComplaintStatus, Priority, Prisma, Role, VerificationStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { BadRequestError, NotFoundError } from '../../utils/apiError.js';
import { AuthService, SafeUser } from '../auth/auth.service.js';
import { generateComplaintNumber } from '../complaints/complaints.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  ListAdminComplaintsQueryInput,
  ListOfficersQueryInput,
  ListUsersQueryInput,
  RejectOfficerInput,
} from './admin.schema.js';

export interface FormattedAdminOfficer {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  designation: string;
  department: { id: string; name: string; description: string | null; active: boolean };
  verification_status: VerificationStatus;
  rejection_reason: string | null;
  is_blocked: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PaginatedAdminOfficersResponse {
  officers: FormattedAdminOfficer[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export interface FormattedAdminComplaint {
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
  citizen: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  };
  assignments: Array<{
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
  created_at: Date;
  updated_at: Date;
}

export interface PaginatedAdminComplaintsResponse {
  complaints: FormattedAdminComplaint[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export interface PaginatedUsersResponse {
  users: SafeUser[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export interface ComplaintsSummaryResponse {
  total_complaints: number;
  total_citizens: number;
  total_officers: number;
  total_departments: number;
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

export interface CivicHotspot {
  cluster_id: string;
  latitude: number;
  longitude: number;
  complaint_count: number;
  status_summary: {
    new: number;
    assigned: number;
    in_progress: number;
    resolved: number;
  };
  departments: Array<{
    department_id: string;
    department_name: string;
    count: number;
  }>;
}

export interface DepartmentStatistics {
  department_id: string;
  department_name: string;
  description: string | null;
  active: boolean;
  total_complaints: number;
  by_status: {
    new: number;
    assigned: number;
    in_progress: number;
    resolved: number;
  };
  average_resolution_time_hours: number | null;
}

export class AdminService {
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
      is_blocked: profile.user.is_blocked ?? false,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
    };
  }

  private static async findOfficerProfileByIdOrUserId(officerId: string) {
    return prisma.officerProfile.findFirst({
      where: { OR: [{ id: officerId }, { user_id: officerId }] },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, role: true, is_blocked: true } },
        department: true,
      },
    });
  }

  public static async listOfficers(query: ListOfficersQueryInput): Promise<PaginatedAdminOfficersResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;
    const where: Prisma.OfficerProfileWhereInput = {};
    if (query.verification_status) where.verification_status = query.verification_status;
    if (query.department_id) where.department_id = query.department_id;

    const [total, records] = await Promise.all([
      prisma.officerProfile.count({ where }),
      prisma.officerProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true, role: true, is_blocked: true } },
          department: true,
        },
      }),
    ]);

    return {
      officers: records.map(this.formatOfficer),
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) || 1 },
    };
  }

  public static async getOfficerById(officerId: string): Promise<FormattedAdminOfficer> {
    const profile = await this.findOfficerProfileByIdOrUserId(officerId);
    if (!profile) throw new NotFoundError(`Officer with ID "${officerId}" not found`);
    return this.formatOfficer(profile);
  }

  public static async approveOfficer(officerId: string): Promise<FormattedAdminOfficer> {
    const existing = await this.findOfficerProfileByIdOrUserId(officerId);
    if (!existing) throw new NotFoundError(`Officer with ID "${officerId}" not found`);
    if (existing.verification_status === VerificationStatus.APPROVED) {
      throw new BadRequestError(`Officer with ID "${officerId}" is already approved`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const officer = await tx.officerProfile.update({
        where: { id: existing.id },
        data: { verification_status: VerificationStatus.APPROVED, rejection_reason: null },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true, role: true, is_blocked: true } },
          department: true,
        },
      });
      await NotificationsService.notifyOfficerApproved(officer.user_id, tx);
      return officer;
    });

    return this.formatOfficer(updated);
  }

  public static async rejectOfficer(officerId: string, input: RejectOfficerInput): Promise<FormattedAdminOfficer> {
    const existing = await this.findOfficerProfileByIdOrUserId(officerId);
    if (!existing) throw new NotFoundError(`Officer with ID "${officerId}" not found`);
    const reason = input.reason?.trim() || null;

    const updated = await prisma.$transaction(async (tx) => {
      const officer = await tx.officerProfile.update({
        where: { id: existing.id },
        data: { verification_status: VerificationStatus.REJECTED, rejection_reason: reason },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true, role: true, is_blocked: true } },
          department: true,
        },
      });
      await NotificationsService.notifyOfficerRejected(officer.user_id, reason ?? undefined, tx);
      return officer;
    });

    return this.formatOfficer(updated);
  }

  public static async assignOfficerDepartment(officerId: string, departmentId: string): Promise<FormattedAdminOfficer> {
    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) throw new NotFoundError(`Department with ID "${departmentId}" not found`);
    if (!department.active) throw new BadRequestError(`Department "${department.name}" is inactive. Cannot assign officers to an inactive department.`);

    const existing = await this.findOfficerProfileByIdOrUserId(officerId);
    if (!existing) throw new NotFoundError(`Officer with ID "${officerId}" not found`);

    const updated = await prisma.officerProfile.update({
      where: { id: existing.id },
      data: { department_id: departmentId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, role: true, is_blocked: true } },
        department: true,
      },
    });

    return this.formatOfficer(updated);
  }

  public static async listOfficersByDepartment(departmentId: string, query: ListOfficersQueryInput): Promise<PaginatedAdminOfficersResponse> {
    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) throw new NotFoundError(`Department with ID "${departmentId}" not found`);
    return this.listOfficers({ ...query, department_id: departmentId });
  }

  public static async listComplaints(query: ListAdminComplaintsQueryInput): Promise<PaginatedAdminComplaintsResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ComplaintWhereInput = {};

    if (query.status && query.status !== 'ALL') {
      where.status = query.status as ComplaintStatus;
    }

    if (query.priority && query.priority !== 'ALL') {
      where.priority = query.priority.toUpperCase() as Priority;
    }

    if (query.department_id) {
      where.department_id = query.department_id;
    } else if (query.department && query.department !== 'ALL') {
      where.department = { name: query.department };
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { citizen: { name: { contains: term, mode: 'insensitive' } } },
        { department: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [total, records] = await Promise.all([
      prisma.complaint.count({ where }),
      prisma.complaint.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          department: { select: { id: true, name: true, description: true } },
          office: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
          citizen: { select: { id: true, name: true, email: true, phone: true } },
          assignments: {
            select: {
              id: true,
              officer_id: true,
              assigned_at: true,
              officer: {
                select: {
                  id: true,
                  designation: true,
                  user: { select: { id: true, name: true, email: true } },
                },
              },
            },
            orderBy: { assigned_at: 'desc' },
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
                  user: { select: { id: true, name: true, email: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    const formatted: FormattedAdminComplaint[] = records.map((c) => {
      const assignmentsList = c.assignments.map((a) => ({
        id: a.id,
        officer_id: a.officer_id,
        officer_name: a.officer.user.name,
        designation: a.officer.designation,
        assigned_at: a.assigned_at,
      }));

      const latestAssignment = assignmentsList[0] || null;

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
          description: c.department.description,
        },
        office: c.office
          ? {
              id: c.office.id,
              name: c.office.name,
              address: c.office.address,
              latitude: c.office.latitude,
              longitude: c.office.longitude,
            }
          : null,
        citizen: {
          id: c.citizen.id,
          name: c.citizen.name,
          email: c.citizen.email,
          phone: c.citizen.phone,
        },
        assignments: assignmentsList,
        assigned_officer: latestAssignment,
        resolution: c.resolution
          ? {
              id: c.resolution.id,
              photo_url: c.resolution.photo_url,
              note: c.resolution.note,
              resolved_at: c.resolution.resolved_at,
              created_at: c.resolution.created_at,
              officer: c.resolution.officer
                ? {
                    id: c.resolution.officer.id,
                    designation: c.resolution.officer.designation,
                    name: c.resolution.officer.user.name,
                  }
                : null,
            }
          : null,
        created_at: c.created_at,
        updated_at: c.updated_at,
      };
    });

    return {
      complaints: formatted,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  public static async listUsers(query: ListUsersQueryInput): Promise<PaginatedUsersResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};
    if (query.role) where.role = query.role;
    if (query.is_blocked !== undefined) where.is_blocked = query.is_blocked;
    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, records] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          officer_profile: {
            include: { department: true },
          },
        },
      }),
    ]);

    return {
      users: records.map(AuthService.sanitizeUser),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  public static async getUserById(userId: string): Promise<SafeUser> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        officer_profile: {
          include: { department: true },
        },
      },
    });

    if (!user) throw new NotFoundError(`User with ID "${userId}" not found`);
    return AuthService.sanitizeUser(user);
  }

  public static async blockUser(adminUserId: string, userId: string): Promise<SafeUser> {
    if (adminUserId === userId) {
      throw new BadRequestError('Administrators cannot block their own account');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        officer_profile: { include: { department: true } },
      },
    });

    if (!user) throw new NotFoundError(`User with ID "${userId}" not found`);
    if (user.is_blocked) {
      throw new BadRequestError(`User account "${user.email}" is already blocked`);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { is_blocked: true },
      include: {
        officer_profile: { include: { department: true } },
      },
    });

    return AuthService.sanitizeUser(updated);
  }

  public static async unblockUser(userId: string): Promise<SafeUser> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        officer_profile: { include: { department: true } },
      },
    });

    if (!user) throw new NotFoundError(`User with ID "${userId}" not found`);
    if (!user.is_blocked) {
      throw new BadRequestError(`User account "${user.email}" is not currently blocked`);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { is_blocked: false },
      include: {
        officer_profile: { include: { department: true } },
      },
    });

    return AuthService.sanitizeUser(updated);
  }

  public static async blockOfficer(adminUserId: string, officerId: string): Promise<FormattedAdminOfficer> {
    const officer = await this.findOfficerProfileByIdOrUserId(officerId);
    if (!officer) throw new NotFoundError(`Officer with ID "${officerId}" not found`);

    if (officer.user_id === adminUserId) {
      throw new BadRequestError('Administrators cannot block their own account');
    }

    if (officer.user.is_blocked) {
      throw new BadRequestError(`Officer "${officer.user.name}" is already blocked`);
    }

    await prisma.user.update({
      where: { id: officer.user_id },
      data: { is_blocked: true },
    });

    const refreshed = await this.findOfficerProfileByIdOrUserId(officer.id);
    return this.formatOfficer(refreshed!);
  }

  public static async unblockOfficer(officerId: string): Promise<FormattedAdminOfficer> {
    const officer = await this.findOfficerProfileByIdOrUserId(officerId);
    if (!officer) throw new NotFoundError(`Officer with ID "${officerId}" not found`);

    if (!officer.user.is_blocked) {
      throw new BadRequestError(`Officer "${officer.user.name}" is not currently blocked`);
    }

    await prisma.user.update({
      where: { id: officer.user_id },
      data: { is_blocked: false },
    });

    const refreshed = await this.findOfficerProfileByIdOrUserId(officer.id);
    return this.formatOfficer(refreshed!);
  }

  public static async getComplaintsSummary(): Promise<ComplaintsSummaryResponse> {
    const [
      total,
      newCount,
      assignedCount,
      inProgressCount,
      resolvedCount,
      departments,
      totalCitizens,
      totalOfficers,
    ] = await Promise.all([
      prisma.complaint.count(),
      prisma.complaint.count({ where: { status: ComplaintStatus.NEW } }),
      prisma.complaint.count({ where: { status: ComplaintStatus.ASSIGNED } }),
      prisma.complaint.count({ where: { status: ComplaintStatus.IN_PROGRESS } }),
      prisma.complaint.count({ where: { status: ComplaintStatus.RESOLVED } }),
      prisma.department.findMany({ select: { id: true, name: true, _count: { select: { complaints: true } } }, orderBy: { name: 'asc' } }),
      prisma.user.count({ where: { role: Role.CITIZEN } }),
      prisma.officerProfile.count(),
    ]);

    return {
      total_complaints: total,
      total_citizens: totalCitizens,
      total_officers: totalOfficers,
      total_departments: departments.length,
      by_status: { new: newCount, assigned: assignedCount, in_progress: inProgressCount, resolved: resolvedCount },
      by_department: departments.map((d) => ({ department_id: d.id, department_name: d.name, count: d._count.complaints })),
    };
  }

  public static async getCivicHotspots(): Promise<{ hotspots: CivicHotspot[] }> {
    const complaints = await prisma.complaint.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      select: {
        id: true, latitude: true, longitude: true, status: true,
        department: { select: { id: true, name: true } },
      },
    });

    const clustersMap = new Map<string, {
      latSum: number;
      lonSum: number;
      count: number;
      status: { new: number; assigned: number; in_progress: number; resolved: number };
      departmentsMap: Map<string, { name: string; count: number }>;
    }>();

    for (const c of complaints) {
      if (c.latitude == null || c.longitude == null) continue;
      const latGrid = c.latitude.toFixed(2);
      const lonGrid = c.longitude.toFixed(2);
      const key = `${latGrid},${lonGrid}`;

      if (!clustersMap.has(key)) {
        clustersMap.set(key, {
          latSum: 0, lonSum: 0, count: 0,
          status: { new: 0, assigned: 0, in_progress: 0, resolved: 0 },
          departmentsMap: new Map(),
        });
      }

      const cluster = clustersMap.get(key)!;
      cluster.latSum += c.latitude;
      cluster.lonSum += c.longitude;
      cluster.count++;

      if (c.status === ComplaintStatus.NEW) cluster.status.new++;
      else if (c.status === ComplaintStatus.ASSIGNED) cluster.status.assigned++;
      else if (c.status === ComplaintStatus.IN_PROGRESS) cluster.status.in_progress++;
      else if (c.status === ComplaintStatus.RESOLVED) cluster.status.resolved++;

      const deptId = c.department.id;
      const deptName = c.department.name;
      const deptEntry = cluster.departmentsMap.get(deptId) || { name: deptName, count: 0 };
      deptEntry.count++;
      cluster.departmentsMap.set(deptId, deptEntry);
    }

    const hotspots: CivicHotspot[] = Array.from(clustersMap.entries()).map(([key, data]) => ({
      cluster_id: key,
      latitude: Math.round((data.latSum / data.count) * 10000) / 10000,
      longitude: Math.round((data.lonSum / data.count) * 10000) / 10000,
      complaint_count: data.count,
      status_summary: data.status,
      departments: Array.from(data.departmentsMap.entries()).map(([deptId, dept]) => ({
        department_id: deptId,
        department_name: dept.name,
        count: dept.count,
      })),
    }));

    hotspots.sort((a, b) => b.complaint_count - a.complaint_count);
    return { hotspots };
  }

  public static async getDepartmentStatistics(): Promise<{ departments: DepartmentStatistics[] }> {
    const departments = await prisma.department.findMany({
      include: {
        complaints: {
          select: {
            id: true, status: true, created_at: true,
            resolution: { select: { resolved_at: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const stats: DepartmentStatistics[] = departments.map((d) => {
      let newCount = 0, assignedCount = 0, inProgressCount = 0, resolvedCount = 0;
      let totalResolutionHours = 0, resolvedWithTimeCount = 0;

      for (const c of d.complaints) {
        if (c.status === ComplaintStatus.NEW) newCount++;
        else if (c.status === ComplaintStatus.ASSIGNED) assignedCount++;
        else if (c.status === ComplaintStatus.IN_PROGRESS) inProgressCount++;
        else if (c.status === ComplaintStatus.RESOLVED) {
          resolvedCount++;
          if (c.resolution?.resolved_at) {
            const diffMs = new Date(c.resolution.resolved_at).getTime() - new Date(c.created_at).getTime();
            const diffHours = Math.max(0, diffMs / (1000 * 60 * 60));
            totalResolutionHours += diffHours;
            resolvedWithTimeCount++;
          }
        }
      }

      const avgResolutionTime =
        resolvedWithTimeCount > 0
          ? Math.round((totalResolutionHours / resolvedWithTimeCount) * 10) / 10
          : null;

      return {
        department_id: d.id,
        department_name: d.name,
        description: d.description,
        active: d.active,
        total_complaints: d.complaints.length,
        by_status: {
          new: newCount,
          assigned: assignedCount,
          in_progress: inProgressCount,
          resolved: resolvedCount,
        },
        average_resolution_time_hours: avgResolutionTime,
      };
    });

    return { departments: stats };
  }
}

