import { ComplaintStatus, Priority } from '@prisma/client';

export interface ComplaintSlaInfo {
  age_hours: number;
  age_days: number;
  sla_threshold_hours: number;
  is_overdue: boolean;
  resolution_time_hours?: number | null;
}

export class ComplaintSlaService {
  public static readonly SLA_THRESHOLDS_HOURS: Record<Priority, number> = {
    [Priority.CRITICAL]: 24, // 24 hours (1 day)
    [Priority.HIGH]: 48,     // 48 hours (2 days)
    [Priority.MEDIUM]: 72,   // 72 hours (3 days)
    [Priority.LOW]: 120,     // 120 hours (5 days)
  };

  /**
   * Calculate aging and SLA status for a complaint
   */
  public static calculateSlaStatus(
    createdAt: Date,
    status: ComplaintStatus,
    priority: Priority = Priority.MEDIUM,
    resolvedAt?: Date | null
  ): ComplaintSlaInfo {
    const thresholdHours = this.SLA_THRESHOLDS_HOURS[priority] || 72;
    const now = new Date();
    const createdTime = new Date(createdAt).getTime();

    let ageHours: number;
    let resolutionHours: number | null = null;

    if (status === ComplaintStatus.RESOLVED && resolvedAt) {
      const resolvedTime = new Date(resolvedAt).getTime();
      resolutionHours = Math.max(0, Math.round(((resolvedTime - createdTime) / (1000 * 60 * 60)) * 10) / 10);
      ageHours = resolutionHours;
    } else {
      ageHours = Math.max(0, Math.round(((now.getTime() - createdTime) / (1000 * 60 * 60)) * 10) / 10);
    }

    const isOverdue = status !== ComplaintStatus.RESOLVED && ageHours > thresholdHours;

    return {
      age_hours: ageHours,
      age_days: Math.round((ageHours / 24) * 10) / 10,
      sla_threshold_hours: thresholdHours,
      is_overdue: isOverdue,
      resolution_time_hours: resolutionHours,
    };
  }
}
