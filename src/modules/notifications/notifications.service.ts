import { ComplaintStatus, Prisma, VerificationStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ForbiddenError, NotFoundError } from '../../utils/apiError.js';
import { generateComplaintNumber } from '../complaints/complaints.service.js';
import { NotificationsQueryInput } from './notifications.schema.js';

export enum NotificationType {
  COMPLAINT_SUBMITTED = 'COMPLAINT_SUBMITTED',
  COMPLAINT_ASSIGNED = 'COMPLAINT_ASSIGNED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  COMPLAINT_RESOLVED = 'COMPLAINT_RESOLVED',
  OFFICER_APPROVED = 'OFFICER_APPROVED',
  OFFICER_REJECTED = 'OFFICER_REJECTED',
}

export interface CreateNotificationParams {
  recipient_user_id: string;
  complaint_id?: string | null;
  title: string;
  message: string;
  type: string;
}

export interface FormattedNotification {
  id: string;
  recipient_user_id: string;
  complaint_id: string | null;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: Date;
}

export interface PaginatedNotificationsResponse {
  notifications: FormattedNotification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export type DbClient = Prisma.TransactionClient | typeof prisma;

export class NotificationsService {
  /**
   * Generic, centralized notification creation with built-in idempotency
   */
  public static async createNotification(
    data: CreateNotificationParams,
    dbClient: DbClient = prisma
  ): Promise<FormattedNotification> {
    // Idempotency: Prevent creating duplicate notifications for identical events
    if (data.complaint_id) {
      const existing = await dbClient.notification.findFirst({
        where: {
          recipient_user_id: data.recipient_user_id,
          complaint_id: data.complaint_id,
          type: data.type,
          message: data.message,
        },
      });

      if (existing) {
        return existing;
      }
    } else {
      const existing = await dbClient.notification.findFirst({
        where: {
          recipient_user_id: data.recipient_user_id,
          type: data.type,
          message: data.message,
        },
      });

      if (existing) {
        return existing;
      }
    }

    return await dbClient.notification.create({
      data: {
        recipient_user_id: data.recipient_user_id,
        complaint_id: data.complaint_id ?? null,
        title: data.title,
        message: data.message,
        type: data.type,
      },
    });
  }

  /**
   * Trigger: When a citizen submits a complaint
   * 1. Confirms to citizen
   * 2. Alerts all approved officers of that department
   */
  public static async notifyComplaintCreated(
    complaintId: string,
    citizenId: string,
    departmentId: string,
    departmentName: string,
    complaintTitle: string,
    dbClient: DbClient = prisma
  ): Promise<void> {
    const complaintNumber = generateComplaintNumber(complaintId);

    // 1. Citizen Confirmation Notification
    await this.createNotification(
      {
        recipient_user_id: citizenId,
        complaint_id: complaintId,
        title: 'Complaint Submitted',
        message: `Your complaint ${complaintNumber} has been submitted to ${departmentName}.`,
        type: NotificationType.COMPLAINT_SUBMITTED,
      },
      dbClient
    );

    // 2. Department Officers Alert Notifications
    const approvedOfficers = await dbClient.officerProfile.findMany({
      where: {
        department_id: departmentId,
        verification_status: VerificationStatus.APPROVED,
      },
      select: {
        user_id: true,
      },
    });

    for (const officer of approvedOfficers) {
      await this.createNotification(
        {
          recipient_user_id: officer.user_id,
          complaint_id: complaintId,
          title: 'New Complaint Received',
          message: `A new complaint ${complaintNumber} has been submitted to ${departmentName}: "${complaintTitle}".`,
          type: NotificationType.COMPLAINT_SUBMITTED,
        },
        dbClient
      );
    }
  }

  /**
   * Trigger: When an officer accepts/assigns a complaint
   */
  public static async notifyComplaintAssigned(
    complaintId: string,
    citizenId: string,
    dbClient: DbClient = prisma
  ): Promise<void> {
    const complaintNumber = generateComplaintNumber(complaintId);

    await this.createNotification(
      {
        recipient_user_id: citizenId,
        complaint_id: complaintId,
        title: 'Complaint Assigned',
        message: `Your complaint ${complaintNumber} has been accepted by the department.`,
        type: NotificationType.COMPLAINT_ASSIGNED,
      },
      dbClient
    );
  }

  /**
   * Trigger: When a complaint status changes (e.g. IN_PROGRESS)
   */
  public static async notifyComplaintStatusChanged(
    complaintId: string,
    citizenId: string,
    newStatus: ComplaintStatus,
    dbClient: DbClient = prisma
  ): Promise<void> {
    const complaintNumber = generateComplaintNumber(complaintId);

    let title = 'Complaint Status Updated';
    let message = `Your complaint ${complaintNumber} status changed to ${newStatus}.`;

    if (newStatus === ComplaintStatus.IN_PROGRESS) {
      title = 'Work Started on Complaint';
      message = `Work has started on your complaint ${complaintNumber}.`;
    }

    await this.createNotification(
      {
        recipient_user_id: citizenId,
        complaint_id: complaintId,
        title,
        message,
        type: NotificationType.STATUS_CHANGED,
      },
      dbClient
    );
  }

  /**
   * Trigger: When a complaint is resolved
   */
  public static async notifyComplaintResolved(
    complaintId: string,
    citizenId: string,
    dbClient: DbClient = prisma
  ): Promise<void> {
    const complaintNumber = generateComplaintNumber(complaintId);

    await this.createNotification(
      {
        recipient_user_id: citizenId,
        complaint_id: complaintId,
        title: 'Complaint Resolved',
        message: `Your complaint ${complaintNumber} has been resolved.`,
        type: NotificationType.COMPLAINT_RESOLVED,
      },
      dbClient
    );
  }

  /**
   * Trigger: When an admin approves an officer account
   */
  public static async notifyOfficerApproved(
    officerUserId: string,
    dbClient: DbClient = prisma
  ): Promise<void> {
    await this.createNotification(
      {
        recipient_user_id: officerUserId,
        complaint_id: null,
        title: 'Officer Account Approved',
        message: 'Your officer profile has been approved. You now have full access to department complaints.',
        type: NotificationType.OFFICER_APPROVED,
      },
      dbClient
    );
  }

  /**
   * Trigger: When an admin rejects an officer account
   */
  public static async notifyOfficerRejected(
    officerUserId: string,
    reason?: string,
    dbClient: DbClient = prisma
  ): Promise<void> {
    const reasonMsg = reason ? ` Reason: ${reason}` : '';
    await this.createNotification(
      {
        recipient_user_id: officerUserId,
        complaint_id: null,
        title: 'Officer Verification Rejected',
        message: `Your officer profile verification was rejected.${reasonMsg}`,
        type: NotificationType.OFFICER_REJECTED,
      },
      dbClient
    );
  }

  /**
   * Retrieve paginated notifications belonging exclusively to the authenticated user
   */
  public static async getUserNotifications(
    userId: string,
    query: NotificationsQueryInput
  ): Promise<PaginatedNotificationsResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      recipient_user_id: userId,
    };

    if (query.is_read !== undefined) {
      where.is_read = query.is_read;
    }

    const [total, records] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          created_at: 'desc',
        },
      }),
    ]);

    const formattedList: FormattedNotification[] = records.map((n) => ({
      id: n.id,
      recipient_user_id: n.recipient_user_id,
      complaint_id: n.complaint_id,
      title: n.title,
      message: n.message,
      type: n.type,
      is_read: n.is_read,
      created_at: n.created_at,
    }));

    return {
      notifications: formattedList,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get unread notification count for the authenticated user
   */
  public static async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await prisma.notification.count({
      where: {
        recipient_user_id: userId,
        is_read: false,
      },
    });

    return { count };
  }

  /**
   * Mark a single notification as read, enforcing strict ownership
   */
  public static async markAsRead(
    userId: string,
    notificationId: string
  ): Promise<FormattedNotification> {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundError(`Notification with ID "${notificationId}" not found`);
    }

    if (notification.recipient_user_id !== userId) {
      throw new ForbiddenError(
        'Access denied: You do not have permission to modify this notification.'
      );
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { is_read: true },
    });

    return {
      id: updated.id,
      recipient_user_id: updated.recipient_user_id,
      complaint_id: updated.complaint_id,
      title: updated.title,
      message: updated.message,
      type: updated.type,
      is_read: updated.is_read,
      created_at: updated.created_at,
    };
  }

  /**
   * Mark all unread notifications belonging to the authenticated user as read
   */
  public static async markAllAsRead(userId: string): Promise<{ updated_count: number }> {
    const result = await prisma.notification.updateMany({
      where: {
        recipient_user_id: userId,
        is_read: false,
      },
      data: {
        is_read: true,
      },
    });

    return {
      updated_count: result.count,
    };
  }
}
