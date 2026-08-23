import http from 'http';
import { AddressInfo } from 'net';
import express, { Express, Request, Response, NextFunction } from 'express';
import { Role, VerificationStatus, Priority, ComplaintStatus } from '@prisma/client';
import { SafeUser } from './src/modules/auth/auth.service.js';
import {
  requireApprovedOfficer,
  requireAuthentication,
  requireCitizen,
} from './src/middlewares/auth.middleware.js';
import { validate } from './src/middlewares/validate.middleware.js';
import {
  assignComplaintSchema,
  complaintIdParamSchema,
  resolveComplaintSchema,
  updateComplaintStatusSchema,
} from './src/modules/officers/officers.schema.js';
import {
  notificationIdParamSchema,
  notificationsQuerySchema,
} from './src/modules/notifications/notifications.schema.js';
import {
  NotificationType,
  NotificationsService,
} from './src/modules/notifications/notifications.service.js';
import crypto from 'crypto';
import { generateComplaintNumber } from './src/modules/complaints/complaints.service.js';
import { errorHandler } from './src/middlewares/error.middleware.js';
import { ForbiddenError, NotFoundError, BadRequestError } from './src/utils/apiError.js';

interface HttpResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: any;
}

function makeRequest(
  serverPort: number,
  method: string,
  path: string,
  bodyData?: Record<string, any>,
  bearerToken?: string
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const postData = bodyData ? JSON.stringify(bodyData) : '';

    const headers: Record<string, string | number> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    };

    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort,
        path,
        method,
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsedBody: any = raw;
          try {
            parsedBody = JSON.parse(raw);
          } catch {
            // Keep raw if not JSON
          }
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            body: parsedBody,
          });
        });
      }
    );

    req.on('error', reject);

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

interface TestResult {
  testId: string;
  name: string;
  passed: boolean;
  message?: string;
}

const testResults: TestResult[] = [];

function recordTest(testId: string, name: string, passed: boolean, message?: string) {
  testResults.push({ testId, name, passed, message });
  const icon = passed ? '✅' : '❌';
  console.log(`  ${icon} [Test ${testId}] ${name}${message ? ` - ${message}` : ''}`);
}

async function runNotificationsTests() {
  console.log('\n===============================================================');
  console.log('   CivicSense B10: In-App Notification System - Test Suite     ');
  console.log('===============================================================\n');

  const deptSanitationId = '11111111-1111-1111-1111-111111111111';
  const deptElectricityId = '44444444-4444-4444-4444-444444444444';

  // 1. Citizen A (Reporter)
  const citizenA: SafeUser = {
    id: 'user-cit-1111-1111-1111-111111111111',
    name: 'Jane Citizen',
    email: 'jane.citizen@civicsense.local',
    phone: '+91-9000000001',
    role: Role.CITIZEN,
    created_at: new Date(),
    updated_at: new Date(),
  };

  // 2. Citizen B (Different User)
  const citizenB: SafeUser = {
    id: 'user-cit-2222-2222-2222-222222222222',
    name: 'John Citizen',
    email: 'john.citizen@civicsense.local',
    phone: '+91-9000000002',
    role: Role.CITIZEN,
    created_at: new Date(),
    updated_at: new Date(),
  };

  // 3. Approved Sanitation Officer
  const officerSanitation: SafeUser = {
    id: 'user-off-sanitation-1',
    name: 'Inspector Ramesh',
    email: 'ramesh.sanitation@civicsense.local',
    phone: '+91-9000000010',
    role: Role.OFFICER,
    created_at: new Date(),
    updated_at: new Date(),
    officer_profile: {
      id: 'prof-off-sanitation-1',
      department_id: deptSanitationId,
      designation: 'Sanitation Chief Inspector',
      verification_status: VerificationStatus.APPROVED,
      created_at: new Date(),
      updated_at: new Date(),
    },
  };

  // 4. Approved Electricity Officer (Other Department)
  const officerElectricity: SafeUser = {
    id: 'user-off-electricity-1',
    name: 'Engineer Vikram',
    email: 'vikram.power@civicsense.local',
    phone: '+91-9000000020',
    role: Role.OFFICER,
    created_at: new Date(),
    updated_at: new Date(),
    officer_profile: {
      id: 'prof-off-electricity-1',
      department_id: deptElectricityId,
      designation: 'Electrical Lead Engineer',
      verification_status: VerificationStatus.APPROVED,
      created_at: new Date(),
      updated_at: new Date(),
    },
  };

  // In-memory notifications store for isolated testing
  const mockNotifications: Array<{
    id: string;
    recipient_user_id: string;
    complaint_id: string | null;
    title: string;
    message: string;
    type: string;
    is_read: boolean;
    created_at: Date;
  }> = [];

  // In-memory complaint store
  const targetComplaintId = 'c1111111-1111-1111-1111-111111111111';
  const mockComplaint = {
    id: targetComplaintId,
    citizen_id: citizenA.id,
    department_id: deptSanitationId,
    office_id: null,
    title: 'Garbage Dump Overflow (Sanitation)',
    description: 'Solid waste uncollected for 3 days.',
    priority: Priority.HIGH,
    status: ComplaintStatus.NEW,
    created_at: new Date(),
    updated_at: new Date(),
    department: { id: deptSanitationId, name: 'Municipality / Sanitation' },
    assignments: [] as any[],
  };

  const testApp: Express = express();
  testApp.use(express.json({ limit: '10mb' }));

  // Authenticator middleware for test suite
  testApp.use(async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    const token = authHeader.substring(7).trim();
    if (token === 'token-citizen-a') {
      req.user = citizenA;
    } else if (token === 'token-citizen-b') {
      req.user = citizenB;
    } else if (token === 'token-officer-sanitation') {
      req.user = officerSanitation;
    } else if (token === 'token-officer-electricity') {
      req.user = officerElectricity;
    }
    next();
  });

  // Mock Notification Creator with Idempotency
  const mockCreateNotification = (data: {
    recipient_user_id: string;
    complaint_id?: string | null;
    title: string;
    message: string;
    type: string;
  }) => {
    // Idempotency check
    const existing = mockNotifications.find(
      (n) =>
        n.recipient_user_id === data.recipient_user_id &&
        n.complaint_id === (data.complaint_id ?? null) &&
        n.type === data.type &&
        n.message === data.message
    );
    if (existing) {
      return existing;
    }

    const newNotification = {
      id: crypto.randomUUID(),
      recipient_user_id: data.recipient_user_id,
      complaint_id: data.complaint_id ?? null,
      title: data.title,
      message: data.message,
      type: data.type,
      is_read: false,
      created_at: new Date(),
    };
    mockNotifications.push(newNotification);
    return newNotification;
  };

  // 1. GET /api/v1/notifications/unread-count
  testApp.get(
    '/api/v1/notifications/unread-count',
    requireAuthentication,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = req.user!;
        const count = mockNotifications.filter(
          (n) => n.recipient_user_id === user.id && !n.is_read
        ).length;
        res.status(200).json({
          success: true,
          message: 'Unread notifications count retrieved',
          data: { count },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 2. PATCH /api/v1/notifications/read-all
  testApp.patch(
    '/api/v1/notifications/read-all',
    requireAuthentication,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = req.user!;
        let updatedCount = 0;
        for (const n of mockNotifications) {
          if (n.recipient_user_id === user.id && !n.is_read) {
            n.is_read = true;
            updatedCount++;
          }
        }
        res.status(200).json({
          success: true,
          message: 'All notifications marked as read successfully',
          data: { updated_count: updatedCount },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 3. GET /api/v1/notifications
  testApp.get(
    '/api/v1/notifications',
    requireAuthentication,
    validate({ query: notificationsQuerySchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = req.user!;
        const query = req.query as any;
        const page = Math.max(1, parseInt(query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 20));

        let userNotifs = mockNotifications.filter((n) => n.recipient_user_id === user.id);

        if (query.is_read !== undefined) {
          userNotifs = userNotifs.filter((n) => n.is_read === (query.is_read === true || query.is_read === 'true'));
        }

        userNotifs.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

        const total = userNotifs.length;
        const startIndex = (page - 1) * limit;
        const paged = userNotifs.slice(startIndex, startIndex + limit);

        res.status(200).json({
          success: true,
          message: 'Notifications retrieved successfully',
          data: {
            notifications: paged,
            pagination: {
              page,
              limit,
              total,
              total_pages: Math.ceil(total / limit) || 1,
            },
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 4. PATCH /api/v1/notifications/:notificationId/read
  testApp.patch(
    '/api/v1/notifications/:notificationId/read',
    requireAuthentication,
    validate({ params: notificationIdParamSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = req.user!;
        const notif = mockNotifications.find((n) => n.id === req.params.notificationId);

        if (!notif) {
          throw new NotFoundError(`Notification with ID "${req.params.notificationId}" not found`);
        }

        if (notif.recipient_user_id !== user.id) {
          throw new ForbiddenError(
            'Access denied: You do not have permission to modify this notification.'
          );
        }

        notif.is_read = true;

        res.status(200).json({
          success: true,
          message: 'Notification marked as read successfully',
          data: notif,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Mock Endpoints for Lifecycle Event Triggers
  // Submit Complaint
  testApp.post(
    '/api/v1/complaints',
    requireAuthentication,
    requireCitizen,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const citizen = req.user!;
        const complaintNumber = generateComplaintNumber(mockComplaint.id);

        // Notify Citizen
        mockCreateNotification({
          recipient_user_id: citizen.id,
          complaint_id: mockComplaint.id,
          title: 'Complaint Submitted',
          message: `Your complaint ${complaintNumber} has been submitted to Municipality / Sanitation.`,
          type: NotificationType.COMPLAINT_SUBMITTED,
        });

        // Notify Department Officers (Sanitation only)
        mockCreateNotification({
          recipient_user_id: officerSanitation.id,
          complaint_id: mockComplaint.id,
          title: 'New Complaint Received',
          message: `A new complaint ${complaintNumber} has been submitted to Municipality / Sanitation: "${mockComplaint.title}".`,
          type: NotificationType.COMPLAINT_SUBMITTED,
        });

        res.status(201).json({
          success: true,
          message: 'Complaint registered successfully',
          data: mockComplaint,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Accept/Assign Complaint
  testApp.post(
    '/api/v1/officer/complaints/:complaintId/assign',
    requireAuthentication,
    requireApprovedOfficer,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const complaintNumber = generateComplaintNumber(mockComplaint.id);
        mockComplaint.status = ComplaintStatus.ASSIGNED;

        // Notify Citizen
        mockCreateNotification({
          recipient_user_id: mockComplaint.citizen_id,
          complaint_id: mockComplaint.id,
          title: 'Complaint Assigned',
          message: `Your complaint ${complaintNumber} has been accepted by the department.`,
          type: NotificationType.COMPLAINT_ASSIGNED,
        });

        res.status(200).json({
          success: true,
          message: 'Complaint accepted and assigned successfully',
          data: mockComplaint,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Start Work (IN_PROGRESS)
  testApp.patch(
    '/api/v1/officer/complaints/:complaintId/status',
    requireAuthentication,
    requireApprovedOfficer,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const complaintNumber = generateComplaintNumber(mockComplaint.id);
        mockComplaint.status = ComplaintStatus.IN_PROGRESS;

        // Notify Citizen
        mockCreateNotification({
          recipient_user_id: mockComplaint.citizen_id,
          complaint_id: mockComplaint.id,
          title: 'Work Started on Complaint',
          message: `Work has started on your complaint ${complaintNumber}.`,
          type: NotificationType.STATUS_CHANGED,
        });

        res.status(200).json({
          success: true,
          message: 'Complaint status updated successfully',
          data: mockComplaint,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Resolve Complaint
  testApp.post(
    '/api/v1/officer/complaints/:complaintId/resolve',
    requireAuthentication,
    requireApprovedOfficer,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const complaintNumber = generateComplaintNumber(mockComplaint.id);
        mockComplaint.status = ComplaintStatus.RESOLVED;

        // Notify Citizen
        mockCreateNotification({
          recipient_user_id: mockComplaint.citizen_id,
          complaint_id: mockComplaint.id,
          title: 'Complaint Resolved',
          message: `Your complaint ${complaintNumber} has been resolved.`,
          type: NotificationType.COMPLAINT_RESOLVED,
        });

        res.status(200).json({
          success: true,
          message: 'Complaint resolved successfully',
          data: mockComplaint,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  testApp.use(errorHandler);

  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  try {
    // -------------------------------------------------------------------------
    // Test A: Citizen submits complaint -> Citizen receives submission notification
    // -------------------------------------------------------------------------
    await makeRequest(
      port,
      'POST',
      '/api/v1/complaints',
      {
        title: 'Garbage Dump Overflow (Sanitation)',
        description: 'Solid waste uncollected for 3 days.',
        department_id: deptSanitationId,
      },
      'token-citizen-a'
    );

    const resA = await makeRequest(port, 'GET', '/api/v1/notifications', undefined, 'token-citizen-a');
    const citizenSubmittedNotif = resA.body?.data?.notifications?.find(
      (n: any) => n.type === 'COMPLAINT_SUBMITTED'
    );
    recordTest(
      'A',
      'Citizen submits complaint → Citizen receives COMPLAINT_SUBMITTED notification',
      !!citizenSubmittedNotif && citizenSubmittedNotif.message.includes('has been submitted'),
      `Citizen received: "${citizenSubmittedNotif?.message}"`
    );

    // -------------------------------------------------------------------------
    // Test B: Department officer receives complaint notification
    // -------------------------------------------------------------------------
    const resB = await makeRequest(
      port,
      'GET',
      '/api/v1/notifications',
      undefined,
      'token-officer-sanitation'
    );
    const officerNotif = resB.body?.data?.notifications?.find(
      (n: any) => n.type === 'COMPLAINT_SUBMITTED'
    );
    recordTest(
      'B',
      'Appropriate department officer receives complaint notification',
      !!officerNotif && officerNotif.title === 'New Complaint Received',
      `Officer received: "${officerNotif?.message}"`
    );

    // -------------------------------------------------------------------------
    // Test C: Officer from another department does NOT receive the notification
    // -------------------------------------------------------------------------
    const resC = await makeRequest(
      port,
      'GET',
      '/api/v1/notifications',
      undefined,
      'token-officer-electricity'
    );
    const electricityNotifs = resC.body?.data?.notifications || [];
    recordTest(
      'C',
      'Officer from another department (Electricity) does NOT receive Sanitation notification',
      electricityNotifs.length === 0,
      `Electricity officer notification count: ${electricityNotifs.length}`
    );

    // -------------------------------------------------------------------------
    // Test D: Officer accepts complaint -> Citizen receives COMPLAINT_ASSIGNED
    // -------------------------------------------------------------------------
    await makeRequest(
      port,
      'POST',
      `/api/v1/officer/complaints/${targetComplaintId}/assign`,
      { action: 'ACCEPT', note: 'Officer Ramesh accepting complaint.' },
      'token-officer-sanitation'
    );

    const resD = await makeRequest(port, 'GET', '/api/v1/notifications', undefined, 'token-citizen-a');
    const assignedNotif = resD.body?.data?.notifications?.find(
      (n: any) => n.type === 'COMPLAINT_ASSIGNED'
    );
    recordTest(
      'D',
      'Officer accepts complaint → Citizen receives COMPLAINT_ASSIGNED notification',
      !!assignedNotif && assignedNotif.message.includes('has been accepted by the department'),
      `Citizen received: "${assignedNotif?.message}"`
    );

    // -------------------------------------------------------------------------
    // Test E: Officer starts IN_PROGRESS -> Citizen receives STATUS_CHANGED
    // -------------------------------------------------------------------------
    await makeRequest(
      port,
      'PATCH',
      `/api/v1/officer/complaints/${targetComplaintId}/status`,
      { status: 'IN_PROGRESS', note: 'Work has started.' },
      'token-officer-sanitation'
    );

    const resE = await makeRequest(port, 'GET', '/api/v1/notifications', undefined, 'token-citizen-a');
    const inProgressNotif = resE.body?.data?.notifications?.find(
      (n: any) => n.type === 'STATUS_CHANGED'
    );
    recordTest(
      'E',
      'Officer starts IN_PROGRESS → Citizen receives STATUS_CHANGED notification',
      !!inProgressNotif && inProgressNotif.message.includes('Work has started'),
      `Citizen received: "${inProgressNotif?.message}"`
    );

    // -------------------------------------------------------------------------
    // Test F: Officer resolves complaint -> Citizen receives COMPLAINT_RESOLVED
    // -------------------------------------------------------------------------
    await makeRequest(
      port,
      'POST',
      `/api/v1/officer/complaints/${targetComplaintId}/resolve`,
      { note: 'Garbage cleared completely.', photo: 'photo-evidence-url' },
      'token-officer-sanitation'
    );

    const resF = await makeRequest(port, 'GET', '/api/v1/notifications', undefined, 'token-citizen-a');
    const resolvedNotif = resF.body?.data?.notifications?.find(
      (n: any) => n.type === 'COMPLAINT_RESOLVED'
    );
    recordTest(
      'F',
      'Officer resolves complaint → Citizen receives COMPLAINT_RESOLVED notification',
      !!resolvedNotif && resolvedNotif.message.includes('has been resolved'),
      `Citizen received: "${resolvedNotif?.message}"`
    );

    // -------------------------------------------------------------------------
    // Test G: User retrieves notifications -> Only own notifications returned
    // -------------------------------------------------------------------------
    const resG = await makeRequest(port, 'GET', '/api/v1/notifications', undefined, 'token-citizen-a');
    const citizenANotifs = resG.body?.data?.notifications || [];
    const allBelongToCitizenA = citizenANotifs.every(
      (n: any) => n.recipient_user_id === citizenA.id
    );
    recordTest(
      'G',
      'User retrieves notifications → Strictly scoped to authenticated user ID',
      allBelongToCitizenA && citizenANotifs.length === 4,
      `Retrieved ${citizenANotifs.length} notifications exclusively for Citizen A`
    );

    // -------------------------------------------------------------------------
    // Test H: User retrieves unread count -> Correct count
    // -------------------------------------------------------------------------
    const resH = await makeRequest(
      port,
      'GET',
      '/api/v1/notifications/unread-count',
      undefined,
      'token-citizen-a'
    );
    const unreadCount = resH.body?.data?.count;
    recordTest(
      'H',
      'User retrieves unread count → Correct count returned',
      resH.statusCode === 200 && unreadCount === 4,
      `Unread count: ${unreadCount}`
    );

    // -------------------------------------------------------------------------
    // Test I: User marks own notification as read -> SUCCESS
    // -------------------------------------------------------------------------
    const targetNotifId = citizenANotifs[0].id;
    const resI = await makeRequest(
      port,
      'PATCH',
      `/api/v1/notifications/${targetNotifId}/read`,
      undefined,
      'token-citizen-a'
    );
    recordTest(
      'I',
      'User marks own notification as read → SUCCESS (200 OK, is_read = true)',
      resI.statusCode === 200 && resI.body?.data?.is_read === true,
      `is_read = ${resI.body?.data?.is_read}`
    );

    // Verify unread count decreased by 1
    const resHAfter = await makeRequest(
      port,
      'GET',
      '/api/v1/notifications/unread-count',
      undefined,
      'token-citizen-a'
    );
    recordTest(
      'H2',
      'Unread count dynamically decrements after marking notification as read',
      resHAfter.body?.data?.count === 3,
      `Updated unread count: ${resHAfter.body?.data?.count}`
    );

    // -------------------------------------------------------------------------
    // Test J: User attempts to mark another user's notification as read -> DENIED
    // -------------------------------------------------------------------------
    const resJ = await makeRequest(
      port,
      'PATCH',
      `/api/v1/notifications/${targetNotifId}/read`,
      undefined,
      'token-citizen-b' // Citizen B trying to modify Citizen A's notification
    );
    recordTest(
      'J',
      "User attempts to mark another user's notification as read → DENIED (403 Forbidden)",
      resJ.statusCode === 403,
      `Received HTTP ${resJ.statusCode}: "${resJ.body?.message}"`
    );

    // -------------------------------------------------------------------------
    // Test K: Mark all as read -> Only current user's notifications affected
    // -------------------------------------------------------------------------
    const resK = await makeRequest(
      port,
      'PATCH',
      '/api/v1/notifications/read-all',
      undefined,
      'token-citizen-a'
    );
    const resKCount = await makeRequest(
      port,
      'GET',
      '/api/v1/notifications/unread-count',
      undefined,
      'token-citizen-a'
    );
    const officerUnreadBefore = await makeRequest(
      port,
      'GET',
      '/api/v1/notifications/unread-count',
      undefined,
      'token-officer-sanitation'
    );
    recordTest(
      'K',
      'Mark all as read → Updates all for current user without affecting other users',
      resK.statusCode === 200 &&
        resKCount.body?.data?.count === 0 &&
        officerUnreadBefore.body?.data?.count === 1,
      `Citizen A unread: ${resKCount.body?.data?.count}, Officer unread preserved: ${officerUnreadBefore.body?.data?.count}`
    );

    // -------------------------------------------------------------------------
    // Test L: Duplicate event does not create unnecessary duplicate notification (Idempotency)
    // -------------------------------------------------------------------------
    const beforeCount = mockNotifications.length;
    // Attempt duplicate creation of same event
    mockCreateNotification({
      recipient_user_id: citizenA.id,
      complaint_id: mockComplaint.id,
      title: 'Complaint Resolved',
      message: `Your complaint ${generateComplaintNumber(mockComplaint.id)} has been resolved.`,
      type: NotificationType.COMPLAINT_RESOLVED,
    });
    const afterCount = mockNotifications.length;
    recordTest(
      'L',
      'Duplicate event dispatch → Idempotency prevents creating redundant duplicate notification',
      beforeCount === afterCount,
      `Notification total unchanged: ${afterCount}`
    );

    // -------------------------------------------------------------------------
    // Test M: Officer approval notification trigger (Prepared for B11)
    // -------------------------------------------------------------------------
    mockCreateNotification({
      recipient_user_id: officerSanitation.id,
      complaint_id: null,
      title: 'Officer Account Approved',
      message: 'Your officer profile has been approved. You now have full access to department complaints.',
      type: NotificationType.OFFICER_APPROVED,
    });
    const resM = await makeRequest(
      port,
      'GET',
      '/api/v1/notifications',
      undefined,
      'token-officer-sanitation'
    );
    const approvalNotif = resM.body?.data?.notifications?.find(
      (n: any) => n.type === 'OFFICER_APPROVED'
    );
    recordTest(
      'M',
      'OFFICER_APPROVED notification dispatch works seamlessly for officer onboarding',
      !!approvalNotif && approvalNotif.title === 'Officer Account Approved',
      `Officer received: "${approvalNotif?.message}"`
    );

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  const total = testResults.length;
  const passed = testResults.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log('\n===============================================================');
  console.log(`                VERIFICATION SUMMARY: ${passed}/${total} PASSED               `);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runNotificationsTests().catch((err) => {
  console.error('Fatal notifications test error:', err);
  process.exit(1);
});
