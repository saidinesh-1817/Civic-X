import { prisma } from '../../config/database.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/apiError.js';
import { calculateHaversineDistance, isValidLatitude, isValidLongitude } from '../../utils/geo.js';
import {
  CreateDepartmentInput,
  CreateOfficeInput,
  UpdateDepartmentInput,
  UpdateOfficeInput,
} from './departments.schema.js';

export interface NearestOfficeResult {
  office: {
    id: string;
    department_id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    active: boolean;
  };
  department: {
    id: string;
    name: string;
  };
  distanceKm: number;
  distanceMeters: number;
  queriedCoordinates: {
    latitude: number;
    longitude: number;
  };
}

export class DepartmentsService {
  /**
   * Retrieve all active departments formatted for frontend consumption
   */
  public static async getAllDepartments(activeOnly: boolean = true) {
    const whereClause = activeOnly ? { active: true } : {};

    const departments = await prisma.department.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        description: true,
        active: true,
        created_at: true,
        _count: {
          select: {
            offices: true,
            officers: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return departments.map((dept) => ({
      id: dept.id,
      name: dept.name,
      description: dept.description,
      active: dept.active,
      officeCount: dept._count.offices,
      officerCount: dept._count.officers,
      createdAt: dept.created_at,
    }));
  }

  /**
   * Retrieve a single department by ID
   */
  public static async getDepartmentById(departmentId: string, activeOnly: boolean = true) {
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        _count: {
          select: {
            offices: true,
            officers: true,
          },
        },
      },
    });

    if (!department || (activeOnly && !department.active)) {
      throw new NotFoundError(`Department with ID "${departmentId}" not found or is currently inactive`);
    }

    return {
      id: department.id,
      name: department.name,
      description: department.description,
      active: department.active,
      officeCount: department._count.offices,
      officerCount: department._count.officers,
      createdAt: department.created_at,
      updatedAt: department.updated_at,
    };
  }

  /**
   * Retrieve active offices belonging to a specific department
   */
  public static async getOfficesByDepartmentId(departmentId: string, activeOnly: boolean = true) {
    // Assert department exists
    await this.getDepartmentById(departmentId, activeOnly);

    const whereClause = {
      department_id: departmentId,
      ...(activeOnly ? { active: true } : {}),
    };

    const offices = await prisma.departmentOffice.findMany({
      where: whereClause,
      select: {
        id: true,
        department_id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
        active: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return offices;
  }

  /**
   * Retrieve a single department office by ID
   */
  public static async getOfficeById(officeId: string, activeOnly: boolean = true) {
    const office = await prisma.departmentOffice.findUnique({
      where: { id: officeId },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            description: true,
            active: true,
          },
        },
      },
    });

    if (!office || (activeOnly && (!office.active || !office.department.active))) {
      throw new NotFoundError(`Office with ID "${officeId}" not found or is currently inactive`);
    }

    return {
      id: office.id,
      department_id: office.department_id,
      name: office.name,
      address: office.address,
      latitude: office.latitude,
      longitude: office.longitude,
      active: office.active,
      department: office.department,
      createdAt: office.created_at,
      updatedAt: office.updated_at,
    };
  }

  /**
   * Find the nearest active department office to the supplied GPS coordinates
   * Uses the standard Haversine great-circle distance algorithm
   * 
   * @param departmentId Target department UUID
   * @param latitude Citizen/incident latitude coordinate (-90 to 90)
   * @param longitude Citizen/incident longitude coordinate (-180 to 180)
   * @returns NearestOfficeResult with closest office, department metadata, and distances
   */
  public static async findNearestDepartmentOffice(
    departmentId: string,
    latitude: number,
    longitude: number
  ): Promise<NearestOfficeResult> {
    if (!isValidLatitude(latitude)) {
      throw new BadRequestError('Invalid latitude coordinate. Must be between -90 and 90 degrees.');
    }

    if (!isValidLongitude(longitude)) {
      throw new BadRequestError('Invalid longitude coordinate. Must be between -180 and 180 degrees.');
    }

    // Verify department exists and is active
    const department = await this.getDepartmentById(departmentId, true);

    // Fetch all active offices for the department
    const activeOffices = await prisma.departmentOffice.findMany({
      where: {
        department_id: departmentId,
        active: true,
      },
    });

    if (activeOffices.length === 0) {
      throw new NotFoundError(
        `No active offices currently registered for department "${department.name}"`
      );
    }

    // Evaluate distances using Haversine calculation
    let nearestOffice = activeOffices[0];
    let minDistance = calculateHaversineDistance(
      latitude,
      longitude,
      nearestOffice.latitude,
      nearestOffice.longitude
    );

    for (let i = 1; i < activeOffices.length; i++) {
      const office = activeOffices[i];
      const dist = calculateHaversineDistance(
        latitude,
        longitude,
        office.latitude,
        office.longitude
      );

      if (dist.distanceKm < minDistance.distanceKm) {
        minDistance = dist;
        nearestOffice = office;
      }
    }

    return {
      office: {
        id: nearestOffice.id,
        department_id: nearestOffice.department_id,
        name: nearestOffice.name,
        address: nearestOffice.address,
        latitude: nearestOffice.latitude,
        longitude: nearestOffice.longitude,
        active: nearestOffice.active,
      },
      department: {
        id: department.id,
        name: department.name,
      },
      distanceKm: minDistance.distanceKm,
      distanceMeters: minDistance.distanceMeters,
      queriedCoordinates: {
        latitude,
        longitude,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Administrative Operations (Strictly ADMIN Authorized)
  // ---------------------------------------------------------------------------

  /**
   * Admin: Create a new civic department
   */
  public static async createDepartment(input: CreateDepartmentInput) {
    const existing = await prisma.department.findUnique({
      where: { name: input.name },
    });

    if (existing) {
      throw new ConflictError(`A department named "${input.name}" already exists`);
    }

    const created = await prisma.department.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        active: input.active ?? true,
      },
    });

    return created;
  }

  /**
   * Admin: Update an existing department
   */
  public static async updateDepartment(departmentId: string, input: UpdateDepartmentInput) {
    await this.getDepartmentById(departmentId, false);

    if (input.name) {
      const duplicate = await prisma.department.findFirst({
        where: {
          name: input.name,
          NOT: { id: departmentId },
        },
      });

      if (duplicate) {
        throw new ConflictError(`Another department named "${input.name}" already exists`);
      }
    }

    const updated = await prisma.department.update({
      where: { id: departmentId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });

    return updated;
  }

  /**
   * Admin: Create a new office under a department
   */
  public static async createOffice(departmentId: string, input: CreateOfficeInput) {
    await this.getDepartmentById(departmentId, false);

    const created = await prisma.departmentOffice.create({
      data: {
        department_id: departmentId,
        name: input.name,
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude,
        active: input.active ?? true,
      },
    });

    return created;
  }

  /**
   * Admin: Update an existing office (disallows changing department_id)
   */
  public static async updateOffice(officeId: string, input: UpdateOfficeInput) {
    await this.getOfficeById(officeId, false);

    const updated = await prisma.departmentOffice.update({
      where: { id: officeId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
        ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });

    return updated;
  }

  /**
   * Admin: Deactivate an office
   */
  public static async deactivateOffice(officeId: string) {
    await this.getOfficeById(officeId, false);

    const updated = await prisma.departmentOffice.update({
      where: { id: officeId },
      data: { active: false },
    });

    return updated;
  }
}
