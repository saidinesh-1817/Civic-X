import { ComplaintStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { calculateHaversineDistance } from '../../utils/geo.js';
import { generateComplaintNumber } from './complaints.service.js';

export interface PotentialDuplicateSummary {
  id: string;
  complaint_number: string;
  title: string;
  status: ComplaintStatus;
  distance_meters: number;
  created_at: Date;
}

export interface DuplicateCheckResult {
  possible_duplicate: boolean;
  duplicate_count: number;
  potential_duplicates: PotentialDuplicateSummary[];
}

export class DuplicateDetectorService {
  private static readonly PROXIMITY_THRESHOLD_METERS = 150; // Within 150 meters
  private static readonly RECENCY_DAYS = 14; // Within last 14 days

  private static extractTokens(text: string): Set<string> {
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3);
    return new Set(words);
  }

  private static computeSimilarity(textA: string, textB: string): number {
    const tokensA = this.extractTokens(textA);
    const tokensB = this.extractTokens(textB);
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersection = 0;
    for (const token of tokensA) {
      if (tokensB.has(token)) intersection++;
    }

    const union = new Set([...tokensA, ...tokensB]).size;
    return intersection / union;
  }

  public static async findPotentialDuplicates(
    departmentId: string,
    latitude?: number | null,
    longitude?: number | null,
    title?: string,
    description?: string
  ): Promise<DuplicateCheckResult> {
    const cutoffDate = new Date(Date.now() - this.RECENCY_DAYS * 24 * 60 * 60 * 1000);

    const recentComplaints = await prisma.complaint.findMany({
      where: {
        department_id: departmentId,
        created_at: { gte: cutoffDate },
        status: {
          in: [ComplaintStatus.NEW, ComplaintStatus.ASSIGNED, ComplaintStatus.IN_PROGRESS],
        },
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        latitude: true,
        longitude: true,
        created_at: true,
      },
      take: 50,
    });

    const potentialDuplicates: PotentialDuplicateSummary[] = [];
    const targetText = `${title || ''} ${description || ''}`;

    for (const complaint of recentComplaints) {
      let isNearby = false;
      let distanceMeters = 0;

      if (
        latitude != null &&
        longitude != null &&
        complaint.latitude != null &&
        complaint.longitude != null
      ) {
        const distResult = calculateHaversineDistance(
          latitude,
          longitude,
          complaint.latitude,
          complaint.longitude
        );
        distanceMeters = distResult.distanceMeters;
        if (distanceMeters <= this.PROXIMITY_THRESHOLD_METERS) isNearby = true;
      }

      const similarity = this.computeSimilarity(
        targetText,
        `${complaint.title} ${complaint.description}`
      );

      if ((isNearby && similarity >= 0.2) || similarity >= 0.6) {
        potentialDuplicates.push({
          id: complaint.id,
          complaint_number: generateComplaintNumber(complaint.id),
          title: complaint.title,
          status: complaint.status,
          distance_meters: distanceMeters,
          created_at: complaint.created_at,
        });
      }
    }

    return {
      possible_duplicate: potentialDuplicates.length > 0,
      duplicate_count: potentialDuplicates.length,
      potential_duplicates: potentialDuplicates,
    };
  }
}
