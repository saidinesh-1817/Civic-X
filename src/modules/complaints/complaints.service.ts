import { ComplaintStatus, Priority, Role } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ForbiddenError, NotFoundError } from '../../utils/apiError.js';
import { saveBase64Image } from '../../utils/fileStorage.js';
import { SafeUser } from '../auth/auth.service.js';
import { DepartmentsService } from '../departments/departments.service.js';
import { CreateComplaintInput } from './complaints.schema.js';

export interface FormattedComplaintResponse {
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
  };
  created_at: Date;
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
   *
   * @param citizen Authenticated citizen user
   * @param input Validated complaint submission payload
   * @returns Formatted complaint response
   */
  public static async createComplaint(
    citizen: SafeUser,
    input: CreateComplaintInput
  ): Promise<FormattedComplaintResponse> {
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

    // 4. Persistence with Atomic Status History Log
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
          priority: Priority.MEDIUM, // Strict default: MEDIUM
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
    };
  }
}
