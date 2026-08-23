import http from 'http';
import { AddressInfo } from 'net';
import express, { Express, Request, Response, NextFunction } from 'express';
import { Role, VerificationStatus, Priority, ComplaintStatus } from '@prisma/client';
import { SafeUser } from './src/modules/auth/auth.service.js';
import {
  requireAdmin,
  requireApprovedOfficer,
  requireAuthentication,
  requireCitizen,
} from './src/middlewares/auth.middleware.js';
import { validate } from './src/middlewares/validate.middleware.js';
import {
  assignOfficerDepartmentSchema,
  departmentIdParamSchema,
  listOfficersQuerySchema,
  officerIdParamSchema,
  rejectOfficerSchema,
} from './src/modules/administration/admin.schema.js';
import {
  NotificationType,
} from './src/modules/notifications/notifications.service.js';
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

async function runAdminTests() {
  console.log('\n===============================================================');
  console.log('  CivicSense B11: Admin & Officer Verification - Test Suite    ');
  console.log('===============================================================\n');

  const deptSanitationId = '11111111-1111-1111-1111-111111111111';
  const deptElectricityId = '22222222-2222-2222-2222-222222222222';
  const deptRoadsId = '33333333-3333-3333-3333-333333333333';
  const inactiveDeptId = '99999999-9999-9999-9999-999999999999';

  const mockDepartments = [
    { id: deptSanitationId, name: 'Municipality / Sanitation', active: true, description: 'Solid waste management' },
    { id: deptElectricityId, name: 'Electricity Board', active: true, description: 'Power grid' },
    { id: deptRoadsId, name: 'Roads & Infrastructure', active: true, description: 'Highways & streetlights' },
    { id: inactiveDeptId, name: 'Defunct Department', active: false, description: 'Decommissioned' },
  ];

  // 1. Admin User
  const adminUser: SafeUser = {
    id: 'a0000001-0001-4001-8001-000000000001',
    name: 'Super Admin',
    email: 'admin@civicsense.local',
    phone: '+91-9999999999',
    role: Role.ADMIN,
    created_at: new Date(),
    updated_at: new Date(),
  };

  // 2. Citizen User
  const citizenUser: SafeUser = {
    id: 'c0000001-0001-4001-8001-000000000001',
    name: 'Rahul Citizen',
    email: 'rahul.citizen@civicsense.local',
    phone: '+91-9000000001',
    role: Role.CITIZEN,
    created_at: new Date(),
    updated_at: new Date(),
  };

  // 3. Officer User (Pending Registration)
  const officerUser: SafeUser = {
    id: 'f0000001-0001-4001-8001-000000000001',
    name: 'Inspector Vijay',
    email: 'vijay.officer@civicsense.local',
    phone: '+91-9888888888',
    role: Role.OFFICER,
    created_at: new Date(),
    updated_at: new Date(),
    officer_profile: {
      id: 'f1111111-1111-4111-8111-111111111111',
      department_id: deptSanitationId,
      designation: 'Field Inspector',
      verification_status: VerificationStatus.PENDING,
      created_at: new Date(),
      updated_at: new Date(),
    },
  };

  // 4. Officer User 2 (Approved Electricity Officer)
  const officerUser2: SafeUser = {
    id: 'f0000002-0002-4002-8002-000000000002',
    name: 'Engineer Neha',
    email: 'neha.power@civicsense.local',
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

  // In-memory Officer Profiles Store
  const mockOfficerProfiles: Array<{
    id: string;
    user_id: string;
    user: SafeUser;
    department_id: string;
    department: { id: string; name: string; description: string | null; active: boolean };
    designation: string;
    verification_status: VerificationStatus;
    rejection_reason: string | null;
    created_at: Date;
    updated_at: Date;
  }> = [
    {
      id: officerUser.officer_profile!.id,
      user_id: officerUser.id,
      user: officerUser,
      department_id: deptSanitationId,
      department: mockDepartments[0],
      designation: 'Field Inspector',
      verification_status: VerificationStatus.PENDING,
      rejection_reason: null,
      created_at: new Date(Date.now() - 3600000),
      updated_at: new Date(),
    },
    {
      id: officerUser2.officer_profile!.id,
      user_id: officerUser2.id,
      user: officerUser2,
      department_id: deptElectricityId,
      department: mockDepartments[1],
      designation: 'Power Engineer',
      verification_status: VerificationStatus.APPROVED,
      rejection_reason: null,
      created_at: new Date(Date.now() - 7200000),
      updated_at: new Date(),
    },
  ];

  // In-memory Notifications Store
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

  // In-memory Complaints Store
  const mockComplaints = [
    { id: 'c1', status: ComplaintStatus.NEW, department_id: deptSanitationId },
    { id: 'c2', status: ComplaintStatus.ASSIGNED, department_id: deptSanitationId },
    { id: 'c3', status: ComplaintStatus.IN_PROGRESS, department_id: deptElectricityId },
    { id: 'c4', status: ComplaintStatus.RESOLVED, department_id: deptRoadsId },
  ];

  const testApp: Express = express();
  testApp.use(express.json({ limit: '10mb' }));

  // Authenticator middleware for test harness
  testApp.use(async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    const token = authHeader.substring(7).trim();
    if (token === 'token-admin') {
      req.user = adminUser;
    } else if (token === 'token-citizen') {
      req.user = citizenUser;
    } else if (token === 'token-officer-pending') {
      req.user = officerUser;
    } else if (token === 'token-officer-approved') {
      req.user = officerUser2;
    }
    next();
  });

  // Helpers
  const formatOfficerProfile = (p: (typeof mockOfficerProfiles)[0]) => ({
    id: p.id,
    user_id: p.user_id,
    name: p.user.name,
    email: p.user.email,
    phone: p.user.phone,
    designation: p.designation,
    department: p.department,
    verification_status: p.verification_status,
    rejection_reason: p.rejection_reason,
    created_at: p.created_at,
    updated_at: p.updated_at,
  });

  const findOfficer = (id: string) => {
    return mockOfficerProfiles.find((p) => p.id === id || p.user_id === id);
  };

  // ===========================================================================
  // ADMIN ROUTES (Under /api/v1/admin/*)
  // ===========================================================================
  const adminTestRouter = express.Router();
  adminTestRouter.use(requireAuthentication, requireAdmin);

  // 1. GET /api/v1/admin/complaints/summary
  adminTestRouter.get('/complaints/summary', async (_req: Request, res: Response) => {
    const summary = {
      total_complaints: mockComplaints.length,
      by_status: {
        new: mockComplaints.filter((c) => c.status === ComplaintStatus.NEW).length,
        assigned: mockComplaints.filter((c) => c.status === ComplaintStatus.ASSIGNED).length,
        in_progress: mockComplaints.filter((c) => c.status === ComplaintStatus.IN_PROGRESS).length,
        resolved: mockComplaints.filter((c) => c.status === ComplaintStatus.RESOLVED).length,
      },
      by_department: mockDepartments
        .filter((d) => d.active)
        .map((d) => ({
          department_id: d.id,
          department_name: d.name,
          count: mockComplaints.filter((c) => c.department_id === d.id).length,
        })),
    };
    res.status(200).json({
      success: true,
      message: 'Complaints summary retrieved successfully',
      data: summary,
    });
  });

  // 2. GET /api/v1/admin/officers
  adminTestRouter.get(
    '/officers',
    validate({ query: listOfficersQuerySchema }),
    async (req: Request, res: Response) => {
      const query = req.query as any;
      const page = Math.max(1, parseInt(query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 20));

      let list = [...mockOfficerProfiles];
      if (query.verification_status) {
        list = list.filter((p) => p.verification_status === query.verification_status);
      }
      if (query.department_id) {
        list = list.filter((p) => p.department_id === query.department_id);
      }

      list.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

      const total = list.length;
      const startIndex = (page - 1) * limit;
      const paged = list.slice(startIndex, startIndex + limit);

      res.status(200).json({
        success: true,
        message: 'Officer registrations retrieved successfully',
        data: {
          officers: paged.map(formatOfficerProfile),
          pagination: {
            page,
            limit,
            total,
            total_pages: Math.ceil(total / limit) || 1,
          },
        },
      });
    }
  );

  // 3. GET /api/v1/admin/departments/:departmentId/officers
  adminTestRouter.get(
    '/departments/:departmentId/officers',
    validate({ params: departmentIdParamSchema, query: listOfficersQuerySchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const dept = mockDepartments.find((d) => d.id === req.params.departmentId);
        if (!dept) {
          throw new NotFoundError(`Department with ID "${req.params.departmentId}" not found`);
        }

        const query = req.query as any;
        let list = mockOfficerProfiles.filter((p) => p.department_id === req.params.departmentId);
        if (query.verification_status) {
          list = list.filter((p) => p.verification_status === query.verification_status);
        }

        res.status(200).json({
          success: true,
          message: 'Department officers retrieved successfully',
          data: {
            officers: list.map(formatOfficerProfile),
            pagination: {
              page: 1,
              limit: 20,
              total: list.length,
              total_pages: 1,
            },
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 4. GET /api/v1/admin/officers/:officerId
  adminTestRouter.get(
    '/officers/:officerId',
    validate({ params: officerIdParamSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const officer = findOfficer(req.params.officerId);
        if (!officer) {
          throw new NotFoundError(`Officer with ID "${req.params.officerId}" not found`);
        }
        res.status(200).json({
          success: true,
          message: 'Officer details retrieved successfully',
          data: formatOfficerProfile(officer),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 5. PATCH /api/v1/admin/officers/:officerId/approve
  adminTestRouter.patch(
    '/officers/:officerId/approve',
    validate({ params: officerIdParamSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const officer = findOfficer(req.params.officerId);
        if (!officer) {
          throw new NotFoundError(`Officer with ID "${req.params.officerId}" not found`);
        }

        officer.verification_status = VerificationStatus.APPROVED;
        officer.rejection_reason = null;
        officer.updated_at = new Date();
        officer.user.officer_profile!.verification_status = VerificationStatus.APPROVED;

        // Create Notification
        mockNotifications.push({
          id: `notif-${Date.now()}`,
          recipient_user_id: officer.user_id,
          complaint_id: null,
          title: 'Officer Account Approved',
          message: 'Your officer profile has been approved. You now have full access to department complaints.',
          type: NotificationType.OFFICER_APPROVED,
          is_read: false,
          created_at: new Date(),
        });

        res.status(200).json({
          success: true,
          message: 'Officer approved successfully',
          data: formatOfficerProfile(officer),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 6. PATCH /api/v1/admin/officers/:officerId/reject
  adminTestRouter.patch(
    '/officers/:officerId/reject',
    validate({ params: officerIdParamSchema, body: rejectOfficerSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const officer = findOfficer(req.params.officerId);
        if (!officer) {
          throw new NotFoundError(`Officer with ID "${req.params.officerId}" not found`);
        }

        const reason = req.body.reason?.trim() || null;
        officer.verification_status = VerificationStatus.REJECTED;
        officer.rejection_reason = reason;
        officer.updated_at = new Date();
        officer.user.officer_profile!.verification_status = VerificationStatus.REJECTED;

        // Create Notification
        mockNotifications.push({
          id: `notif-${Date.now()}`,
          recipient_user_id: officer.user_id,
          complaint_id: null,
          title: 'Officer Verification Rejected',
          message: `Your officer profile verification was rejected.${reason ? ` Reason: ${reason}` : ''}`,
          type: NotificationType.OFFICER_REJECTED,
          is_read: false,
          created_at: new Date(),
        });

        res.status(200).json({
          success: true,
          message: 'Officer rejected successfully',
          data: formatOfficerProfile(officer),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 7. PATCH /api/v1/admin/officers/:officerId/department
  adminTestRouter.patch(
    '/officers/:officerId/department',
    validate({ params: officerIdParamSchema, body: assignOfficerDepartmentSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const targetDept = mockDepartments.find((d) => d.id === req.body.department_id);
        if (!targetDept) {
          throw new NotFoundError(`Department with ID "${req.body.department_id}" not found`);
        }
        if (!targetDept.active) {
          throw new BadRequestError(
            `Department "${targetDept.name}" is inactive. Cannot assign officers to an inactive department.`
          );
        }

        const officer = findOfficer(req.params.officerId);
        if (!officer) {
          throw new NotFoundError(`Officer with ID "${req.params.officerId}" not found`);
        }

        officer.department_id = targetDept.id;
        officer.department = targetDept;
        officer.user.officer_profile!.department_id = targetDept.id;
        officer.updated_at = new Date();

        res.status(200).json({
          success: true,
          message: 'Officer department updated successfully',
          data: formatOfficerProfile(officer),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  testApp.use('/api/v1/admin', adminTestRouter);

  // Protected Officer Endpoint (to test access transition)
  testApp.get(
    '/api/v1/officer/complaints',
    requireAuthentication,
    requireApprovedOfficer,
    async (req: Request, res: Response) => {
      res.status(200).json({
        success: true,
        message: 'Department complaints retrieved',
        data: { department_id: req.user!.officer_profile!.department_id },
      });
    }
  );

  testApp.use(errorHandler);

  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  try {
    // -------------------------------------------------------------------------
    // Test A: Admin lists officers (GET /api/v1/admin/officers)
    // -------------------------------------------------------------------------
    const resA = await makeRequest(port, 'GET', '/api/v1/admin/officers', undefined, 'token-admin');
    const officersList = resA.body?.data?.officers || [];
    recordTest(
      'A',
      'Admin lists officers → SUCCESS (200 OK)',
      resA.statusCode === 200 && officersList.length >= 2,
      `Retrieved ${officersList.length} officer profiles`
    );

    // -------------------------------------------------------------------------
    // Test B: Admin filters pending officers (?verification_status=PENDING)
    // -------------------------------------------------------------------------
    const resB = await makeRequest(
      port,
      'GET',
      '/api/v1/admin/officers?verification_status=PENDING',
      undefined,
      'token-admin'
    );
    const pendingList = resB.body?.data?.officers || [];
    const allPending = pendingList.every((o: any) => o.verification_status === 'PENDING');
    recordTest(
      'B',
      'Admin filters pending officers (?verification_status=PENDING)',
      resB.statusCode === 200 && pendingList.length === 1 && allPending,
      `Found ${pendingList.length} pending officer(s): ${pendingList[0]?.name}`
    );

    // -------------------------------------------------------------------------
    // Test C: Admin views officer details
    // -------------------------------------------------------------------------
    const resC = await makeRequest(
      port,
      'GET',
      `/api/v1/admin/officers/${officerUser.officer_profile!.id}`,
      undefined,
      'token-admin'
    );
    recordTest(
      'C',
      'Admin views detailed officer profile (No passwords exposed)',
      resC.statusCode === 200 &&
        resC.body?.data?.email === 'vijay.officer@civicsense.local' &&
        resC.body?.data?.password_hash === undefined,
      `Officer: ${resC.body?.data?.name}, Designation: ${resC.body?.data?.designation}`
    );

    // -------------------------------------------------------------------------
    // Test D: Admin assigns/changes officer department
    // -------------------------------------------------------------------------
    const resD = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/officers/${officerUser.officer_profile!.id}/department`,
      { department_id: deptElectricityId },
      'token-admin'
    );
    recordTest(
      'D',
      'Admin assigns officer department → Department updated to Electricity Board',
      resD.statusCode === 200 && resD.body?.data?.department?.id === deptElectricityId,
      `New Department: "${resD.body?.data?.department?.name}"`
    );

    // -------------------------------------------------------------------------
    // Test G1: Pending officer cannot access protected officer functionality
    // -------------------------------------------------------------------------
    const resG1 = await makeRequest(
      port,
      'GET',
      '/api/v1/officer/complaints',
      undefined,
      'token-officer-pending'
    );
    recordTest(
      'G1',
      'Pending officer attempts to access officer functionality → DENIED (403 Forbidden)',
      resG1.statusCode === 403,
      `Received HTTP ${resG1.statusCode}: "${resG1.body?.message}"`
    );

    // -------------------------------------------------------------------------
    // Test E: Admin approves officer
    // -------------------------------------------------------------------------
    const resE = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/officers/${officerUser.officer_profile!.id}/approve`,
      undefined,
      'token-admin'
    );
    recordTest(
      'E',
      'Admin approves officer → verification_status = APPROVED',
      resE.statusCode === 200 && resE.body?.data?.verification_status === 'APPROVED',
      `Officer status: ${resE.body?.data?.verification_status}`
    );

    // -------------------------------------------------------------------------
    // Test F: Officer approval notification created
    // -------------------------------------------------------------------------
    const approvalNotif = mockNotifications.find(
      (n) => n.recipient_user_id === officerUser.id && n.type === 'OFFICER_APPROVED'
    );
    recordTest(
      'F',
      'OFFICER_APPROVED notification created for officer',
      !!approvalNotif && approvalNotif.title === 'Officer Account Approved',
      `Notification: "${approvalNotif?.message}"`
    );

    // -------------------------------------------------------------------------
    // Test G2: Approved officer now gains access to officer endpoints
    // -------------------------------------------------------------------------
    const resG2 = await makeRequest(
      port,
      'GET',
      '/api/v1/officer/complaints',
      undefined,
      'token-officer-pending' // Now updated to APPROVED in profile
    );
    recordTest(
      'G2',
      'Approved officer accesses officer functionality → SUCCESS (200 OK)',
      resG2.statusCode === 200 && resG2.body?.data?.department_id === deptElectricityId,
      `Access granted for department: ${resG2.body?.data?.department_id}`
    );

    // -------------------------------------------------------------------------
    // Test H: Admin rejects officer with reason
    // -------------------------------------------------------------------------
    const resH = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/officers/${officerUser.officer_profile!.id}/reject`,
      { reason: 'Fraudulent badge identification number.' },
      'token-admin'
    );
    recordTest(
      'H',
      'Admin rejects officer with reason → verification_status = REJECTED & rejection_reason stored',
      resH.statusCode === 200 &&
        resH.body?.data?.verification_status === 'REJECTED' &&
        resH.body?.data?.rejection_reason === 'Fraudulent badge identification number.',
      `Status: REJECTED, Reason: "${resH.body?.data?.rejection_reason}"`
    );

    // -------------------------------------------------------------------------
    // Test I: Rejected officer loses protected officer access
    // -------------------------------------------------------------------------
    const resI = await makeRequest(
      port,
      'GET',
      '/api/v1/officer/complaints',
      undefined,
      'token-officer-pending'
    );
    recordTest(
      'I',
      'Rejected officer attempts to access officer functionality → DENIED (403 Forbidden)',
      resI.statusCode === 403,
      `Received HTTP ${resI.statusCode}: "${resI.body?.message}"`
    );

    // -------------------------------------------------------------------------
    // Test P: Re-approving previously rejected officer
    // -------------------------------------------------------------------------
    const resP = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/officers/${officerUser.officer_profile!.id}/approve`,
      undefined,
      'token-admin'
    );
    recordTest(
      'P',
      'Admin re-approves previously rejected officer → SUCCESS & reason cleared',
      resP.statusCode === 200 &&
        resP.body?.data?.verification_status === 'APPROVED' &&
        resP.body?.data?.rejection_reason === null,
      `Status restored to: ${resP.body?.data?.verification_status}`
    );

    // -------------------------------------------------------------------------
    // Test J: Citizen cannot access admin endpoints
    // -------------------------------------------------------------------------
    const resJ = await makeRequest(
      port,
      'GET',
      '/api/v1/admin/officers',
      undefined,
      'token-citizen'
    );
    recordTest(
      'J',
      'Citizen attempts to access admin endpoints → DENIED (403 Forbidden)',
      resJ.statusCode === 403,
      `Received HTTP ${resJ.statusCode}`
    );

    // -------------------------------------------------------------------------
    // Test K: Officer cannot access admin endpoints
    // -------------------------------------------------------------------------
    const resK = await makeRequest(
      port,
      'GET',
      '/api/v1/admin/officers',
      undefined,
      'token-officer-approved'
    );
    recordTest(
      'K',
      'Officer attempts to access admin endpoints → DENIED (403 Forbidden)',
      resK.statusCode === 403,
      `Received HTTP ${resK.statusCode}`
    );

    // -------------------------------------------------------------------------
    // Test L: Admin can view complaints summary
    // -------------------------------------------------------------------------
    const resL = await makeRequest(
      port,
      'GET',
      '/api/v1/admin/complaints/summary',
      undefined,
      'token-admin'
    );
    recordTest(
      'L',
      'Admin views complaints summary metrics overview',
      resL.statusCode === 200 &&
        resL.body?.data?.total_complaints === 4 &&
        resL.body?.data?.by_status?.new === 1 &&
        resL.body?.data?.by_status?.resolved === 1,
      `Total: ${resL.body?.data?.total_complaints}, Departments reported: ${resL.body?.data?.by_department?.length}`
    );

    // -------------------------------------------------------------------------
    // Test M1: Assigning inactive department is rejected (400 Bad Request)
    // -------------------------------------------------------------------------
    const resM1 = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/officers/${officerUser.officer_profile!.id}/department`,
      { department_id: inactiveDeptId },
      'token-admin'
    );
    recordTest(
      'M1',
      'Assigning inactive department to officer → DENIED (400 BadRequestError)',
      resM1.statusCode === 400,
      `Received HTTP ${resM1.statusCode}: "${resM1.body?.message}"`
    );

    // -------------------------------------------------------------------------
    // Test M2: Assigning non-existent department is rejected (404 Not Found)
    // -------------------------------------------------------------------------
    const resM2 = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/officers/${officerUser.officer_profile!.id}/department`,
      { department_id: '00000000-0000-0000-0000-000000000000' },
      'token-admin'
    );
    recordTest(
      'M2',
      'Assigning non-existent department to officer → DENIED (404 NotFoundError)',
      resM2.statusCode === 404,
      `Received HTTP ${resM2.statusCode}: "${resM2.body?.message}"`
    );

    // -------------------------------------------------------------------------
    // Test N: List officers by department (GET /departments/:deptId/officers)
    // -------------------------------------------------------------------------
    const resN = await makeRequest(
      port,
      'GET',
      `/api/v1/admin/departments/${deptElectricityId}/officers`,
      undefined,
      'token-admin'
    );
    recordTest(
      'N',
      'Admin lists officers by department (Electricity Board)',
      resN.statusCode === 200 && resN.body?.data?.officers?.length === 2,
      `Officers in Electricity: ${resN.body?.data?.officers?.length}`
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

runAdminTests().catch((err) => {
  console.error('Fatal admin test error:', err);
  process.exit(1);
});
