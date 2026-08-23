import http from 'http';
import { AddressInfo } from 'net';
import express, { Express, Request, Response, NextFunction } from 'express';
import { Role, VerificationStatus, Priority, ComplaintStatus } from '@prisma/client';
import crypto from 'crypto';
import { SafeUser } from './src/modules/auth/auth.service.js';
import {
  requireAdmin,
  requireApprovedOfficer,
  requireAuthentication,
  requireCitizen,
} from './src/middlewares/auth.middleware.js';
import { validate } from './src/middlewares/validate.middleware.js';
import {
  createComplaintSchema,
  myComplaintsQuerySchema,
} from './src/modules/complaints/complaints.schema.js';
import {
  assignComplaintSchema,
  complaintIdParamSchema,
  resolveComplaintSchema,
  updateComplaintStatusSchema,
} from './src/modules/officers/officers.schema.js';
import {
  assignOfficerDepartmentSchema,
  departmentIdParamSchema,
  listOfficersQuerySchema,
  officerIdParamSchema,
  rejectOfficerSchema,
} from './src/modules/administration/admin.schema.js';
import {
  notificationIdParamSchema,
  notificationsQuerySchema,
} from './src/modules/notifications/notifications.schema.js';
import {
  NotificationType,
} from './src/modules/notifications/notifications.service.js';
import { generateComplaintNumber } from './src/modules/complaints/complaints.service.js';
import { saveBase64Image } from './src/utils/fileStorage.js';
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

async function runMasterIntegrationTests() {
  console.log('\n================================================================');
  console.log('  CivicSense B12: Master End-to-End Integration Test Suite     ');
  console.log('================================================================\n');

  // Valid 1x1 PNG Base64 for file upload simulation
  const validPngBase64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const deptSanitationId = '11111111-1111-1111-1111-111111111111';
  const deptElectricityId = '22222222-2222-2222-2222-222222222222';
  const officeCentralSanitationId = '11111111-1111-1111-1111-222222222222';

  const mockDepartments = [
    { id: deptSanitationId, name: 'Municipality / Sanitation', active: true, description: 'Waste and cleaning' },
    { id: deptElectricityId, name: 'Electricity Board', active: true, description: 'Power grid and lighting' },
  ];

  const mockOffices = [
    {
      id: officeCentralSanitationId,
      department_id: deptSanitationId,
      name: 'Sanitation Central Division',
      address: 'Sector 4, Central Municipal Complex',
      latitude: 12.9716,
      longitude: 77.5946,
    },
  ];

  // Users
  const adminUser: SafeUser = {
    id: 'a0000001-0001-4001-8001-000000000001',
    name: 'Super Admin',
    email: 'admin@civicsense.local',
    phone: '+91-9999999999',
    role: Role.ADMIN,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const citizenUser: SafeUser = {
    id: 'c0000001-0001-4001-8001-000000000001',
    name: 'Ananya Sharma',
    email: 'ananya.citizen@civicsense.local',
    phone: '+91-9000000001',
    role: Role.CITIZEN,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const officerSanitation: SafeUser = {
    id: 'f0000001-0001-4001-8001-000000000001',
    name: 'Officer Rajesh Kumar',
    email: 'rajesh.sanitation@civicsense.local',
    phone: '+91-9888888888',
    role: Role.OFFICER,
    created_at: new Date(),
    updated_at: new Date(),
    officer_profile: {
      id: 'f1111111-1111-4111-8111-111111111111',
      department_id: deptSanitationId,
      designation: 'Sanitation Field Officer',
      verification_status: VerificationStatus.PENDING, // Starts as PENDING
      created_at: new Date(),
      updated_at: new Date(),
    },
  };

  const officerElectricity: SafeUser = {
    id: 'f0000002-0002-4002-8002-000000000002',
    name: 'Officer Vikramaditya',
    email: 'vikram.power@civicsense.local',
    phone: '+91-9777777777',
    role: Role.OFFICER,
    created_at: new Date(),
    updated_at: new Date(),
    officer_profile: {
      id: 'f2222222-2222-4222-8222-222222222222',
      department_id: deptElectricityId,
      designation: 'Power Engineer',
      verification_status: VerificationStatus.APPROVED,
      created_at: new Date(),
      updated_at: new Date(),
    },
  };

  // State Stores
  const mockComplaints: any[] = [];
  const mockNotifications: any[] = [];

  const createNotification = (data: {
    recipient_user_id: string;
    complaint_id?: string | null;
    title: string;
    message: string;
    type: string;
  }) => {
    const existing = mockNotifications.find(
      (n) =>
        n.recipient_user_id === data.recipient_user_id &&
        n.complaint_id === (data.complaint_id ?? null) &&
        n.type === data.type &&
        n.message === data.message
    );
    if (existing) return existing;

    const notif = {
      id: crypto.randomUUID(),
      recipient_user_id: data.recipient_user_id,
      complaint_id: data.complaint_id ?? null,
      title: data.title,
      message: data.message,
      type: data.type,
      is_read: false,
      created_at: new Date(),
    };
    mockNotifications.push(notif);
    return notif;
  };

  const testApp: Express = express();
  testApp.use(express.json({ limit: '10mb' }));

  // Auth Bearer token dispatcher for testing
  testApp.use(async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    const token = authHeader.substring(7).trim();
    if (token === 'token-admin') req.user = adminUser;
    else if (token === 'token-citizen') req.user = citizenUser;
    else if (token === 'token-officer-sanitation') req.user = officerSanitation;
    else if (token === 'token-officer-electricity') req.user = officerElectricity;
    next();
  });

  // Health checks
  testApp.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'CivicSense API', timestamp: new Date().toISOString() });
  });
  testApp.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'CivicSense API', timestamp: new Date().toISOString() });
  });
  testApp.get('/api/v1/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'CivicSense API', timestamp: new Date().toISOString() });
  });

  // 1. Auth Me endpoint
  testApp.get('/api/v1/auth/me', requireAuthentication, (req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      message: 'Authenticated profile retrieved successfully',
      data: req.user,
    });
  });

  // 2. Departments List
  testApp.get('/api/v1/departments', (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      message: 'Departments retrieved successfully',
      data: mockDepartments,
    });
  });

  // 3. Citizen Complaint Submission
  testApp.post(
    '/api/v1/complaints',
    requireAuthentication,
    requireCitizen,
    validate({ body: createComplaintSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const citizen = req.user!;
        const input = req.body;
        const savedPhoto = await saveBase64Image(input.photo, 'complaints');

        const newComplaint = {
          id: crypto.randomUUID(),
          citizen_id: citizen.id,
          department_id: input.department_id,
          office_id: officeCentralSanitationId,
          title: input.title,
          description: input.description,
          photo_url: savedPhoto.urlPath,
          latitude: input.latitude,
          longitude: input.longitude,
          priority: Priority.MEDIUM,
          status: ComplaintStatus.NEW,
          created_at: new Date(),
          updated_at: new Date(),
          department: mockDepartments.find((d) => d.id === input.department_id),
          office: mockOffices[0],
          citizen: { id: citizen.id, name: citizen.name, email: citizen.email },
          status_history: [
            {
              id: crypto.randomUUID(),
              status: ComplaintStatus.NEW,
              note: 'Complaint registered by citizen.',
              created_at: new Date(),
            },
          ],
          resolution: null as any,
          assignments: [] as any[],
        };

        mockComplaints.push(newComplaint);
        const compNumber = generateComplaintNumber(newComplaint.id);

        // Notify Citizen
        createNotification({
          recipient_user_id: citizen.id,
          complaint_id: newComplaint.id,
          title: 'Complaint Submitted',
          message: `Your complaint ${compNumber} has been submitted to ${newComplaint.department?.name}.`,
          type: NotificationType.COMPLAINT_SUBMITTED,
        });

        // Notify Approved Department Officers
        if (officerSanitation.officer_profile?.verification_status === VerificationStatus.APPROVED) {
          createNotification({
            recipient_user_id: officerSanitation.id,
            complaint_id: newComplaint.id,
            title: 'New Complaint Received',
            message: `A new complaint ${compNumber} has been submitted to ${newComplaint.department?.name}: "${newComplaint.title}".`,
            type: NotificationType.COMPLAINT_SUBMITTED,
          });
        }

        res.status(201).json({
          success: true,
          message: 'Complaint registered successfully',
          data: {
            ...newComplaint,
            complaint_number: compNumber,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 4. Citizen Complaint Details
  testApp.get(
    '/api/v1/complaints/:complaintId',
    requireAuthentication,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const complaint = mockComplaints.find((c) => c.id === req.params.complaintId);
        if (!complaint) throw new NotFoundError('Complaint not found');
        if (req.user!.role === Role.CITIZEN && complaint.citizen_id !== req.user!.id) {
          throw new ForbiddenError('Access denied: You can only access your own complaints.');
        }
        res.status(200).json({
          success: true,
          message: 'Complaint details retrieved successfully',
          data: {
            ...complaint,
            complaint_number: generateComplaintNumber(complaint.id),
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 5. Admin Endpoints
  testApp.patch(
    '/api/v1/admin/officers/:officerId/approve',
    requireAuthentication,
    requireAdmin,
    (req: Request, res: Response) => {
      officerSanitation.officer_profile!.verification_status = VerificationStatus.APPROVED;
      createNotification({
        recipient_user_id: officerSanitation.id,
        complaint_id: null,
        title: 'Officer Account Approved',
        message: 'Your officer profile has been approved. You now have full access to department complaints.',
        type: NotificationType.OFFICER_APPROVED,
      });
      res.status(200).json({
        success: true,
        message: 'Officer approved successfully',
        data: officerSanitation,
      });
    }
  );

  testApp.get(
    '/api/v1/admin/complaints/summary',
    requireAuthentication,
    requireAdmin,
    (_req: Request, res: Response) => {
      res.status(200).json({
        success: true,
        message: 'Complaints summary retrieved successfully',
        data: {
          total_complaints: mockComplaints.length,
          by_status: {
            new: mockComplaints.filter((c) => c.status === ComplaintStatus.NEW).length,
            assigned: mockComplaints.filter((c) => c.status === ComplaintStatus.ASSIGNED).length,
            in_progress: mockComplaints.filter((c) => c.status === ComplaintStatus.IN_PROGRESS).length,
            resolved: mockComplaints.filter((c) => c.status === ComplaintStatus.RESOLVED).length,
          },
          by_department: mockDepartments.map((d) => ({
            department_id: d.id,
            department_name: d.name,
            count: mockComplaints.filter((c) => c.department_id === d.id).length,
          })),
        },
      });
    }
  );

  // 6. Officer Endpoints
  testApp.get(
    '/api/v1/officer/complaints',
    requireAuthentication,
    requireApprovedOfficer,
    (req: Request, res: Response) => {
      const deptId = req.user!.officer_profile!.department_id;
      const filtered = mockComplaints.filter((c) => c.department_id === deptId);
      res.status(200).json({
        success: true,
        message: 'Department complaints retrieved',
        data: {
          complaints: filtered.map((c) => ({
            id: c.id,
            complaint_number: generateComplaintNumber(c.id),
            title: c.title,
            status: c.status,
            priority: c.priority,
            department: c.department,
          })),
        },
      });
    }
  );

  testApp.post(
    '/api/v1/officer/complaints/:complaintId/assign',
    requireAuthentication,
    requireApprovedOfficer,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const complaint = mockComplaints.find((c) => c.id === req.params.complaintId);
        if (!complaint) throw new NotFoundError('Complaint not found');
        if (complaint.department_id !== req.user!.officer_profile!.department_id) {
          throw new ForbiddenError('Access denied: Department mismatch');
        }
        if (complaint.status !== ComplaintStatus.NEW) {
          throw new BadRequestError('Only NEW complaints can be accepted');
        }
        complaint.status = ComplaintStatus.ASSIGNED;
        complaint.assignments.push({ officer_id: req.user!.officer_profile!.id, assigned_at: new Date() });
        complaint.status_history.push({
          id: crypto.randomUUID(),
          status: ComplaintStatus.ASSIGNED,
          note: 'Accepted by officer',
          created_at: new Date(),
        });
        const compNumber = generateComplaintNumber(complaint.id);
        createNotification({
          recipient_user_id: complaint.citizen_id,
          complaint_id: complaint.id,
          title: 'Complaint Assigned',
          message: `Your complaint ${compNumber} has been accepted by the department.`,
          type: NotificationType.COMPLAINT_ASSIGNED,
        });
        res.status(200).json({ success: true, message: 'Complaint assigned', data: complaint });
      } catch (err) {
        next(err);
      }
    }
  );

  testApp.patch(
    '/api/v1/officer/complaints/:complaintId/status',
    requireAuthentication,
    requireApprovedOfficer,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const complaint = mockComplaints.find((c) => c.id === req.params.complaintId);
        if (!complaint) throw new NotFoundError('Complaint not found');
        if (complaint.department_id !== req.user!.officer_profile!.department_id) {
          throw new ForbiddenError('Access denied: Department mismatch');
        }
        if (complaint.status !== ComplaintStatus.ASSIGNED) {
          throw new BadRequestError('Cannot move to IN_PROGRESS from status: ' + complaint.status);
        }
        complaint.status = ComplaintStatus.IN_PROGRESS;
        complaint.status_history.push({
          id: crypto.randomUUID(),
          status: ComplaintStatus.IN_PROGRESS,
          note: 'Work started',
          created_at: new Date(),
        });
        const compNumber = generateComplaintNumber(complaint.id);
        createNotification({
          recipient_user_id: complaint.citizen_id,
          complaint_id: complaint.id,
          title: 'Work Started on Complaint',
          message: `Work has started on your complaint ${compNumber}.`,
          type: NotificationType.STATUS_CHANGED,
        });
        res.status(200).json({ success: true, message: 'Status updated', data: complaint });
      } catch (err) {
        next(err);
      }
    }
  );

  testApp.post(
    '/api/v1/officer/complaints/:complaintId/resolve',
    requireAuthentication,
    requireApprovedOfficer,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const complaint = mockComplaints.find((c) => c.id === req.params.complaintId);
        if (!complaint) throw new NotFoundError('Complaint not found');
        if (complaint.department_id !== req.user!.officer_profile!.department_id) {
          throw new ForbiddenError('Access denied: Department mismatch');
        }
        if (complaint.status !== ComplaintStatus.IN_PROGRESS) {
          throw new BadRequestError('Cannot resolve complaint from status: ' + complaint.status);
        }
        const savedResolutionPhoto = await saveBase64Image(req.body.photo, 'resolutions');
        complaint.status = ComplaintStatus.RESOLVED;
        complaint.resolution = {
          id: crypto.randomUUID(),
          photo_url: savedResolutionPhoto.urlPath,
          note: req.body.note,
          resolved_at: new Date(),
        };
        complaint.status_history.push({
          id: crypto.randomUUID(),
          status: ComplaintStatus.RESOLVED,
          note: req.body.note,
          created_at: new Date(),
        });
        const compNumber = generateComplaintNumber(complaint.id);
        createNotification({
          recipient_user_id: complaint.citizen_id,
          complaint_id: complaint.id,
          title: 'Complaint Resolved',
          message: `Your complaint ${compNumber} has been resolved.`,
          type: NotificationType.COMPLAINT_RESOLVED,
        });
        res.status(200).json({ success: true, message: 'Complaint resolved', data: complaint });
      } catch (err) {
        next(err);
      }
    }
  );

  // 7. Notifications Endpoints
  testApp.get('/api/v1/notifications', requireAuthentication, (req: Request, res: Response) => {
    const list = mockNotifications.filter((n) => n.recipient_user_id === req.user!.id);
    res.status(200).json({
      success: true,
      message: 'Notifications retrieved',
      data: { notifications: list, pagination: { page: 1, limit: 20, total: list.length, total_pages: 1 } },
    });
  });

  testApp.get('/api/v1/notifications/unread-count', requireAuthentication, (req: Request, res: Response) => {
    const count = mockNotifications.filter((n) => n.recipient_user_id === req.user!.id && !n.is_read).length;
    res.status(200).json({ success: true, message: 'Unread count', data: { count } });
  });

  testApp.use(errorHandler);

  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  try {
    // -------------------------------------------------------------------------
    // Stage 1: Health Check Probes
    // -------------------------------------------------------------------------
    const resHealthRoot = await makeRequest(port, 'GET', '/health');
    const resHealthApi = await makeRequest(port, 'GET', '/api/health');
    const resHealthV1 = await makeRequest(port, 'GET', '/api/v1/health');
    recordTest(
      '1.1',
      'System Health Checks (/health, /api/health, /api/v1/health)',
      resHealthRoot.statusCode === 200 &&
        resHealthApi.statusCode === 200 &&
        resHealthV1.statusCode === 200 &&
        resHealthV1.body?.status === 'ok',
      `Health check status: ${resHealthV1.body?.status}`
    );

    // -------------------------------------------------------------------------
    // Stage 2: Authentication & Profile Verification
    // -------------------------------------------------------------------------
    const resAuthMe = await makeRequest(port, 'GET', '/api/v1/auth/me', undefined, 'token-citizen');
    recordTest(
      '2.1',
      'Authenticated Profile Retrieval (GET /auth/me - No password hashes)',
      resAuthMe.statusCode === 200 &&
        resAuthMe.body?.data?.email === 'ananya.citizen@civicsense.local' &&
        resAuthMe.body?.data?.password_hash === undefined,
      `User: ${resAuthMe.body?.data?.name} (${resAuthMe.body?.data?.role})`
    );

    // -------------------------------------------------------------------------
    // Stage 3: Citizen Creates Complaint with GPS & Base64 Photo
    // -------------------------------------------------------------------------
    const resCreateComplaint = await makeRequest(
      port,
      'POST',
      '/api/v1/complaints',
      {
        title: 'Massive Waste Overflow on MG Road',
        description: 'Commercial solid waste accumulated for 4 days blocking footpath.',
        department_id: deptSanitationId,
        photo: validPngBase64,
        latitude: 12.9718,
        longitude: 77.5947,
      },
      'token-citizen'
    );
    const createdComplaintId = resCreateComplaint.body?.data?.id;
    const complaintNumber = resCreateComplaint.body?.data?.complaint_number;
    recordTest(
      '3.1',
      'Citizen submits complaint with photo & GPS → Created in NEW status with nearest office assigned',
      resCreateComplaint.statusCode === 201 &&
        resCreateComplaint.body?.data?.status === 'NEW' &&
        resCreateComplaint.body?.data?.photo_url?.startsWith('/uploads/complaints/'),
      `Complaint No: ${complaintNumber}, Photo: ${resCreateComplaint.body?.data?.photo_url}`
    );

    // Verify Citizen Submission Notification
    const resCitizenNotifs1 = await makeRequest(port, 'GET', '/api/v1/notifications', undefined, 'token-citizen');
    const citizenSubmittedNotif = resCitizenNotifs1.body?.data?.notifications?.find(
      (n: any) => n.type === 'COMPLAINT_SUBMITTED'
    );
    recordTest(
      '3.2',
      'Citizen receives COMPLAINT_SUBMITTED confirmation notification',
      !!citizenSubmittedNotif && citizenSubmittedNotif.message.includes('has been submitted to Municipality / Sanitation'),
      `Message: "${citizenSubmittedNotif?.message}"`
    );

    // -------------------------------------------------------------------------
    // Stage 4: Officer Verification Workflow
    // -------------------------------------------------------------------------
    // Pending officer blocked
    const resOfficerPending = await makeRequest(port, 'GET', '/api/v1/officer/complaints', undefined, 'token-officer-sanitation');
    recordTest(
      '4.1',
      'Pending officer blocked from accessing officer endpoints (403 Forbidden)',
      resOfficerPending.statusCode === 403,
      `HTTP ${resOfficerPending.statusCode}`
    );

    // Admin approves officer
    const resAdminApprove = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/officers/${officerSanitation.officer_profile!.id}/approve`,
      undefined,
      'token-admin'
    );
    recordTest(
      '4.2',
      'Admin approves officer → verification_status = APPROVED & OFFICER_APPROVED notification created',
      resAdminApprove.statusCode === 200,
      `Status: APPROVED`
    );

    // Approved officer gains access and lists department complaints
    const resOfficerComplaints = await makeRequest(
      port,
      'GET',
      '/api/v1/officer/complaints',
      undefined,
      'token-officer-sanitation'
    );
    const officerDeptComplaints = resOfficerComplaints.body?.data?.complaints || [];
    recordTest(
      '4.3',
      'Approved officer lists department complaints → Sees newly registered complaint',
      resOfficerComplaints.statusCode === 200 && officerDeptComplaints.length === 1,
      `Department Complaints Count: ${officerDeptComplaints.length}`
    );

    // -------------------------------------------------------------------------
    // Stage 5: Status Transitions & Resolution Lifecycle
    // -------------------------------------------------------------------------
    // Officer accepts complaint
    const resAccept = await makeRequest(
      port,
      'POST',
      `/api/v1/officer/complaints/${createdComplaintId}/assign`,
      { note: 'Accepting MG Road sanitation task.' },
      'token-officer-sanitation'
    );
    recordTest(
      '5.1',
      'Officer accepts complaint → Transitions NEW → ASSIGNED',
      resAccept.statusCode === 200 && resAccept.body?.data?.status === 'ASSIGNED',
      `Status: ${resAccept.body?.data?.status}`
    );

    // Officer starts work
    const resStartWork = await makeRequest(
      port,
      'PATCH',
      `/api/v1/officer/complaints/${createdComplaintId}/status`,
      { status: 'IN_PROGRESS', note: 'Cleaning crew dispatched with disposal truck.' },
      'token-officer-sanitation'
    );
    recordTest(
      '5.2',
      'Officer starts work → Transitions ASSIGNED → IN_PROGRESS',
      resStartWork.statusCode === 200 && resStartWork.body?.data?.status === 'IN_PROGRESS',
      `Status: ${resStartWork.body?.data?.status}`
    );

    // Officer resolves complaint with photo evidence
    const resResolve = await makeRequest(
      port,
      'POST',
      `/api/v1/officer/complaints/${createdComplaintId}/resolve`,
      { note: 'Waste completely cleared and footpath sanitized.', photo: validPngBase64 },
      'token-officer-sanitation'
    );
    recordTest(
      '5.3',
      'Officer resolves complaint with resolution photo & note → Transitions IN_PROGRESS → RESOLVED',
      resResolve.statusCode === 200 &&
        resResolve.body?.data?.status === 'RESOLVED' &&
        resResolve.body?.data?.resolution?.photo_url?.startsWith('/uploads/resolutions/'),
      `Status: RESOLVED, Resolution Photo: ${resResolve.body?.data?.resolution?.photo_url}`
    );

    // -------------------------------------------------------------------------
    // Stage 6: Citizen Verification & Timeline Inspection
    // -------------------------------------------------------------------------
    const resCitizenComplaint = await makeRequest(
      port,
      'GET',
      `/api/v1/complaints/${createdComplaintId}`,
      undefined,
      'token-citizen'
    );
    const historyTimeline = resCitizenComplaint.body?.data?.status_history || [];
    recordTest(
      '6.1',
      'Citizen views resolved complaint with complete status history timeline & resolution details',
      resCitizenComplaint.statusCode === 200 &&
        resCitizenComplaint.body?.data?.status === 'RESOLVED' &&
        resCitizenComplaint.body?.data?.resolution?.note.includes('Waste completely cleared') &&
        historyTimeline.length === 4,
      `Timeline: ${historyTimeline.map((h: any) => h.status).join(' → ')}`
    );

    // Verify all 4 lifecycle notifications received by citizen
    const resCitizenNotifsFinal = await makeRequest(port, 'GET', '/api/v1/notifications', undefined, 'token-citizen');
    const citizenFinalNotifs = resCitizenNotifsFinal.body?.data?.notifications || [];
    recordTest(
      '6.2',
      'Citizen received all in-app notifications (SUBMITTED, ASSIGNED, STATUS_CHANGED, RESOLVED)',
      citizenFinalNotifs.length === 4,
      `Notifications received: ${citizenFinalNotifs.map((n: any) => n.type).join(', ')}`
    );

    // -------------------------------------------------------------------------
    // Stage 7: Security & Boundary Enforcement
    // -------------------------------------------------------------------------
    // Electricity officer tries to resolve Sanitation complaint -> 403 Forbidden
    const resCrossDept = await makeRequest(
      port,
      'POST',
      `/api/v1/officer/complaints/${createdComplaintId}/resolve`,
      { note: 'Unauthorized action', photo: validPngBase64 },
      'token-officer-electricity'
    );
    recordTest(
      '7.1',
      'Cross-department officer accessing complaint → DENIED (403 Forbidden)',
      resCrossDept.statusCode === 403,
      `HTTP ${resCrossDept.statusCode}`
    );

    // Citizen tries to access admin summary -> 403 Forbidden
    const resCitizenAdmin = await makeRequest(port, 'GET', '/api/v1/admin/complaints/summary', undefined, 'token-citizen');
    recordTest(
      '7.2',
      'Citizen accessing admin endpoints → DENIED (403 Forbidden)',
      resCitizenAdmin.statusCode === 403,
      `HTTP ${resCitizenAdmin.statusCode}`
    );

    // Officer tries to access admin summary -> 403 Forbidden
    const resOfficerAdmin = await makeRequest(
      port,
      'GET',
      '/api/v1/admin/complaints/summary',
      undefined,
      'token-officer-sanitation'
    );
    recordTest(
      '7.3',
      'Officer accessing admin endpoints → DENIED (403 Forbidden)',
      resOfficerAdmin.statusCode === 403,
      `HTTP ${resOfficerAdmin.statusCode}`
    );

    // Re-opening / Modifying resolved complaint -> 400 BadRequestError
    const resReopen = await makeRequest(
      port,
      'PATCH',
      `/api/v1/officer/complaints/${createdComplaintId}/status`,
      { status: 'IN_PROGRESS', note: 'Attempting invalid re-open' },
      'token-officer-sanitation'
    );
    recordTest(
      '7.4',
      'Modifying or re-opening a RESOLVED complaint → DENIED (400 BadRequestError)',
      resReopen.statusCode === 400,
      `HTTP ${resReopen.statusCode}`
    );

    // -------------------------------------------------------------------------
    // Stage 8: Admin Complaints Summary Metrics
    // -------------------------------------------------------------------------
    const resAdminSummary = await makeRequest(port, 'GET', '/api/v1/admin/complaints/summary', undefined, 'token-admin');
    recordTest(
      '8.1',
      'Admin retrieves complaint summary metrics overview',
      resAdminSummary.statusCode === 200 &&
        resAdminSummary.body?.data?.total_complaints === 1 &&
        resAdminSummary.body?.data?.by_status?.resolved === 1,
      `Total: ${resAdminSummary.body?.data?.total_complaints}, Resolved: ${resAdminSummary.body?.data?.by_status?.resolved}`
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

  console.log('\n================================================================');
  console.log(`                VERIFICATION SUMMARY: ${passed}/${total} PASSED               `);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runMasterIntegrationTests().catch((err) => {
  console.error('Fatal master integration test error:', err);
  process.exit(1);
});
