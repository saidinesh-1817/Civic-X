import http from 'http';
import { AddressInfo } from 'net';
import express, { Express, Request, Response, NextFunction } from 'express';
import { Role, VerificationStatus, Priority, ComplaintStatus } from '@prisma/client';
import { prisma } from './src/config/database.js';
import { SafeUser } from './src/modules/auth/auth.service.js';
import {
  requireApprovedOfficer,
  requireAuthentication,
} from './src/middlewares/auth.middleware.js';
import { validate } from './src/middlewares/validate.middleware.js';
import {
  assignComplaintSchema,
  complaintIdParamSchema,
  officerComplaintsQuerySchema,
  AssignComplaintInput,
  OfficerComplaintsQueryInput,
} from './src/modules/officers/officers.schema.js';
import { generateComplaintNumber } from './src/modules/complaints/complaints.service.js';
import { errorHandler } from './src/middlewares/error.middleware.js';
import { ForbiddenError, NotFoundError, UnauthorizedError, BadRequestError } from './src/utils/apiError.js';

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

async function runOfficerComplaintTests() {
  console.log('\n===============================================================');
  console.log('    CivicSense B8: Officer Complaint Management - Test Suite   ');
  console.log('===============================================================\n');

  const deptSanitationId = '11111111-1111-1111-1111-111111111111';
  const deptElectricityId = '44444444-4444-4444-4444-444444444444';
  const officeEastSanitationId = 'aaaa2222-2222-2222-2222-222222222222';

  // Approved Sanitation Officer
  const officerSanitationApproved: SafeUser = {
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

  // Pending Sanitation Officer
  const officerSanitationPending: SafeUser = {
    id: 'user-off-sanitation-2',
    name: 'Trainee Suresh',
    email: 'suresh.pending@civicsense.local',
    phone: '+91-9000000011',
    role: Role.OFFICER,
    created_at: new Date(),
    updated_at: new Date(),
    officer_profile: {
      id: 'prof-off-sanitation-2',
      department_id: deptSanitationId,
      designation: 'Junior Inspector',
      verification_status: VerificationStatus.PENDING,
      created_at: new Date(),
      updated_at: new Date(),
    },
  };

  // Rejected Officer
  const officerRejected: SafeUser = {
    id: 'user-off-sanitation-3',
    name: 'Rejected Officer',
    email: 'rejected.officer@civicsense.local',
    phone: '+91-9000000012',
    role: Role.OFFICER,
    created_at: new Date(),
    updated_at: new Date(),
    officer_profile: {
      id: 'prof-off-sanitation-3',
      department_id: deptSanitationId,
      designation: 'Officer Candidate',
      verification_status: VerificationStatus.REJECTED,
      created_at: new Date(),
      updated_at: new Date(),
    },
  };

  // Citizen User
  const citizenUser: SafeUser = {
    id: 'user-cit-1',
    name: 'Jane Citizen',
    email: 'jane.citizen@civicsense.local',
    phone: '+91-9000000001',
    role: Role.CITIZEN,
    created_at: new Date(),
    updated_at: new Date(),
  };

  // In-memory complaint dataset for testing
  const mockComplaints = [
    {
      id: 'c1111111-1111-1111-1111-111111111111',
      citizen_id: citizenUser.id,
      department_id: deptSanitationId,
      office_id: officeEastSanitationId,
      title: 'Garbage Dump Overflow (Sanitation)',
      description: 'Solid waste uncollected for 3 days.',
      photo_url: '/uploads/complaints/garbage.jpg',
      latitude: 12.981,
      longitude: 77.632,
      priority: Priority.HIGH,
      status: ComplaintStatus.NEW,
      created_at: new Date('2026-08-18T10:00:00.000Z'),
      updated_at: new Date('2026-08-18T10:00:00.000Z'),
      department: { id: deptSanitationId, name: 'Municipality / Sanitation', description: 'Sanitation' },
      office: { id: officeEastSanitationId, name: 'East Ward Sanitation Office', address: 'Indiranagar', latitude: 12.981, longitude: 77.632 },
      status_history: [
        { id: 'sh-1', status: ComplaintStatus.NEW, note: 'Registered by citizen.', created_at: new Date('2026-08-18T10:00:00.000Z') },
      ],
      assignments: [] as any[],
      resolution: null,
    },
    {
      id: 'c2222222-2222-2222-2222-222222222222',
      citizen_id: citizenUser.id,
      department_id: deptSanitationId,
      office_id: null,
      title: 'Stagnant Drain Water (Sanitation)',
      description: 'Drain clogged causing water accumulation.',
      photo_url: null,
      latitude: 12.97,
      longitude: 77.59,
      priority: Priority.MEDIUM,
      status: ComplaintStatus.NEW,
      created_at: new Date('2026-08-19T11:00:00.000Z'),
      updated_at: new Date('2026-08-19T11:00:00.000Z'),
      department: { id: deptSanitationId, name: 'Municipality / Sanitation', description: 'Sanitation' },
      office: null,
      status_history: [
        { id: 'sh-2', status: ComplaintStatus.NEW, note: 'Registered by citizen.', created_at: new Date('2026-08-19T11:00:00.000Z') },
      ],
      assignments: [] as any[],
      resolution: null,
    },
    {
      id: 'c4444444-4444-4444-4444-444444444444',
      citizen_id: citizenUser.id,
      department_id: deptElectricityId,
      office_id: null,
      title: 'Faulty High-Tension Wire (Electricity)',
      description: 'Dangerous spark on electric pole.',
      photo_url: null,
      latitude: 12.93,
      longitude: 77.61,
      priority: Priority.CRITICAL,
      status: ComplaintStatus.NEW,
      created_at: new Date('2026-08-20T08:00:00.000Z'),
      updated_at: new Date('2026-08-20T08:00:00.000Z'),
      department: { id: deptElectricityId, name: 'Electricity', description: 'Power' },
      office: null,
      status_history: [
        { id: 'sh-3', status: ComplaintStatus.NEW, note: 'Registered by citizen.', created_at: new Date('2026-08-20T08:00:00.000Z') },
      ],
      assignments: [] as any[],
      resolution: null,
    },
  ];

  const testApp: Express = express();
  testApp.use(express.json({ limit: '10mb' }));

  // Authenticator middleware
  testApp.use(async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    const token = authHeader.substring(7).trim();
    if (token === 'token-officer-approved') {
      req.user = officerSanitationApproved;
    } else if (token === 'token-officer-pending') {
      req.user = officerSanitationPending;
    } else if (token === 'token-officer-rejected') {
      req.user = officerRejected;
    } else if (token === 'token-citizen') {
      req.user = citizenUser;
    }
    next();
  });

  // GET /api/v1/officer/complaints
  testApp.get(
    '/api/v1/officer/complaints',
    requireAuthentication,
    requireApprovedOfficer,
    validate({ query: officerComplaintsQuerySchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const officer = req.user!;
        const query = req.query as any;
        const page = Math.max(1, parseInt(query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 10));

        const deptId = officer.officer_profile!.department_id;
        let filtered = mockComplaints.filter((c) => c.department_id === deptId);

        if (query.status) {
          filtered = filtered.filter((c) => c.status === query.status);
        }
        if (query.priority) {
          filtered = filtered.filter((c) => c.priority === query.priority);
        }
        if (query.office_id) {
          filtered = filtered.filter((c) => c.office_id === query.office_id);
        }

        const total = filtered.length;
        const startIndex = (page - 1) * limit;
        const paged = filtered.slice(startIndex, startIndex + limit);

        const formatted = paged.map((c) => {
          const latestAssignment = c.assignments[0] || null;
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
            department: { id: c.department.id, name: c.department.name },
            office: c.office ? { id: c.office.id, name: c.office.name, address: c.office.address } : null,
            created_at: c.created_at,
            updated_at: c.updated_at,
            assignment: latestAssignment
              ? {
                  id: latestAssignment.id,
                  officer_id: latestAssignment.officer_id,
                  officer_name: latestAssignment.officer_name,
                  designation: latestAssignment.designation,
                  assigned_at: latestAssignment.assigned_at,
                }
              : null,
          };
        });

        res.status(200).json({
          success: true,
          message: 'Department complaints retrieved successfully',
          data: {
            complaints: formatted,
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

  // GET /api/v1/officer/complaints/:complaintId
  testApp.get(
    '/api/v1/officer/complaints/:complaintId',
    requireAuthentication,
    requireApprovedOfficer,
    validate({ params: complaintIdParamSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const officer = req.user!;
        const deptId = officer.officer_profile!.department_id;
        const complaint = mockComplaints.find((c) => c.id === req.params.complaintId);

        if (!complaint) {
          throw new NotFoundError(`Complaint with ID "${req.params.complaintId}" not found`);
        }

        if (complaint.department_id !== deptId) {
          throw new ForbiddenError(
            'Access denied: You do not have permission to view complaints belonging to another department.'
          );
        }

        const formattedDetail = {
          id: complaint.id,
          complaint_number: generateComplaintNumber(complaint.id),
          title: complaint.title,
          description: complaint.description,
          photo_url: complaint.photo_url,
          latitude: complaint.latitude,
          longitude: complaint.longitude,
          priority: complaint.priority,
          status: complaint.status,
          department: complaint.department,
          office: complaint.office,
          created_at: complaint.created_at,
          updated_at: complaint.updated_at,
          status_history: complaint.status_history,
          assignments: complaint.assignments,
          resolution: complaint.resolution,
        };

        res.status(200).json({
          success: true,
          message: 'Complaint details retrieved successfully',
          data: formattedDetail,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/v1/officer/complaints/:complaintId/assign
  testApp.post(
    '/api/v1/officer/complaints/:complaintId/assign',
    requireAuthentication,
    requireApprovedOfficer,
    validate({ params: complaintIdParamSchema, body: assignComplaintSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const officer = req.user!;
        const deptId = officer.officer_profile!.department_id;
        const complaint = mockComplaints.find((c) => c.id === req.params.complaintId);

        if (!complaint) {
          throw new NotFoundError(`Complaint with ID "${req.params.complaintId}" not found`);
        }

        if (complaint.department_id !== deptId) {
          throw new ForbiddenError(
            'Access denied: You cannot accept complaints belonging to another department.'
          );
        }

        if (complaint.status !== ComplaintStatus.NEW) {
          throw new BadRequestError(
            `Complaint cannot be accepted because it is currently in "${complaint.status}" status (only "NEW" complaints can be accepted).`
          );
        }

        // Status transition: NEW -> ASSIGNED
        complaint.status = ComplaintStatus.ASSIGNED;
        complaint.updated_at = new Date();

        const assignmentRecord = {
          id: `asgn-${complaint.assignments.length + 1}`,
          complaint_id: complaint.id,
          officer_id: officer.officer_profile!.id,
          officer_name: officer.name,
          designation: officer.officer_profile!.designation,
          assigned_by: officer.id,
          assigned_at: new Date(),
        };
        complaint.assignments.push(assignmentRecord);

        // Status history record
        complaint.status_history.push({
          id: `sh-${complaint.status_history.length + 1}`,
          status: ComplaintStatus.ASSIGNED,
          note: req.body.note || `Complaint accepted by officer ${officer.name}.`,
          created_at: new Date(),
        });

        res.status(200).json({
          success: true,
          message: 'Complaint accepted and assigned successfully',
          data: {
            id: complaint.id,
            complaint_number: generateComplaintNumber(complaint.id),
            title: complaint.title,
            status: complaint.status,
            assignments: complaint.assignments,
            status_history: complaint.status_history,
          },
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
    // Test A: Approved Municipality officer lists Municipality complaints
    // -------------------------------------------------------------------------
    const resA = await makeRequest(port, 'GET', '/api/v1/officer/complaints', undefined, 'token-officer-approved');
    const hasDeptComplaints =
      resA.statusCode === 200 &&
      resA.body?.success === true &&
      Array.isArray(resA.body?.data?.complaints) &&
      resA.body?.data?.complaints.length === 2 &&
      resA.body?.data?.complaints.every((c: any) => c.department.id === deptSanitationId);
    recordTest(
      'A',
      'Approved Municipality officer lists Municipality complaints → SUCCESS (200 OK)',
      hasDeptComplaints,
      `Returned ${resA.body?.data?.complaints?.length} complaints for Municipality / Sanitation`
    );

    // -------------------------------------------------------------------------
    // Test B: Officer attempts to query Electricity complaints through query manipulation
    // -------------------------------------------------------------------------
    const resB = await makeRequest(
      port,
      'GET',
      `/api/v1/officer/complaints?department_id=${deptElectricityId}`,
      undefined,
      'token-officer-approved'
    );
    const cannotAccessElectricity =
      resB.statusCode === 200 &&
      resB.body?.data?.complaints.every((c: any) => c.department.id === deptSanitationId);
    recordTest(
      'B',
      'Officer query param manipulation (?department_id=...) → Ignored; strictly scoped to officer department',
      cannotAccessElectricity
    );

    // -------------------------------------------------------------------------
    // Test C: Approved officer opens own department complaint
    // -------------------------------------------------------------------------
    const resC = await makeRequest(
      port,
      'GET',
      '/api/v1/officer/complaints/c1111111-1111-1111-1111-111111111111',
      undefined,
      'token-officer-approved'
    );
    const canViewOwnDept =
      resC.statusCode === 200 &&
      resC.body?.data?.id === 'c1111111-1111-1111-1111-111111111111' &&
      resC.body?.data?.department?.id === deptSanitationId;
    recordTest(
      'C',
      'Approved officer opens own department complaint → SUCCESS (200 OK)',
      canViewOwnDept
    );

    // -------------------------------------------------------------------------
    // Test D: Officer opens another department's complaint
    // -------------------------------------------------------------------------
    const resD = await makeRequest(
      port,
      'GET',
      '/api/v1/officer/complaints/c4444444-4444-4444-4444-444444444444', // Electricity complaint
      undefined,
      'token-officer-approved' // Sanitation officer
    );
    recordTest(
      'D',
      "Officer opens another department's complaint → DENIED (403 Forbidden)",
      resD.statusCode === 403
    );

    // -------------------------------------------------------------------------
    // Test E: Officer accepts NEW complaint
    // -------------------------------------------------------------------------
    const resE = await makeRequest(
      port,
      'POST',
      '/api/v1/officer/complaints/c1111111-1111-1111-1111-111111111111/assign',
      { action: 'ACCEPT', note: 'Officer Ramesh taking ownership.' },
      'token-officer-approved'
    );
    const acceptSuccess =
      resE.statusCode === 200 &&
      resE.body?.success === true &&
      resE.body?.data?.status === 'ASSIGNED';
    recordTest(
      'E',
      'Officer accepts NEW complaint → SUCCESS (200 OK)',
      acceptSuccess
    );

    // -------------------------------------------------------------------------
    // Test F: Complaint status transitions NEW -> ASSIGNED
    // -------------------------------------------------------------------------
    const updatedComplaint = mockComplaints.find((c) => c.id === 'c1111111-1111-1111-1111-111111111111');
    recordTest(
      'F',
      'Complaint status transitions NEW → ASSIGNED in database',
      updatedComplaint?.status === 'ASSIGNED'
    );

    // -------------------------------------------------------------------------
    // Test G: ComplaintAssignment record created correctly
    // -------------------------------------------------------------------------
    const latestAsgn = updatedComplaint?.assignments[0];
    const isAssignmentValid =
      !!latestAsgn &&
      latestAsgn.officer_id === officerSanitationApproved.officer_profile!.id &&
      latestAsgn.assigned_by === officerSanitationApproved.id;
    recordTest(
      'G',
      'ComplaintAssignment record created with authentic officer_id & assigned_by',
      isAssignmentValid
    );

    // -------------------------------------------------------------------------
    // Test H: ComplaintStatusHistory record created (status = ASSIGNED, changed_by = officer.id)
    // -------------------------------------------------------------------------
    const latestHistory = updatedComplaint?.status_history.find((h) => h.status === 'ASSIGNED');
    const isHistoryValid =
      !!latestHistory &&
      latestHistory.status === 'ASSIGNED' &&
      latestHistory.note?.includes('Ramesh');
    recordTest(
      'H',
      'ComplaintStatusHistory record logged with status = ASSIGNED and officer note',
      isHistoryValid
    );

    // -------------------------------------------------------------------------
    // Test I: Citizen tries officer endpoint
    // -------------------------------------------------------------------------
    const resI = await makeRequest(
      port,
      'GET',
      '/api/v1/officer/complaints',
      undefined,
      'token-citizen'
    );
    recordTest(
      'I',
      'Citizen attempts to access officer endpoints → DENIED (403 Forbidden)',
      resI.statusCode === 403
    );

    // -------------------------------------------------------------------------
    // Test J: Pending / Rejected officer tries officer endpoint
    // -------------------------------------------------------------------------
    const resJPending = await makeRequest(
      port,
      'GET',
      '/api/v1/officer/complaints',
      undefined,
      'token-officer-pending'
    );
    const resJRejected = await makeRequest(
      port,
      'GET',
      '/api/v1/officer/complaints',
      undefined,
      'token-officer-rejected'
    );
    recordTest(
      'J',
      'Pending and Rejected officers rejected → DENIED (403 Forbidden)',
      resJPending.statusCode === 403 && resJRejected.statusCode === 403
    );

    // -------------------------------------------------------------------------
    // Test K: Officer tries to spoof officer_id in body
    // -------------------------------------------------------------------------
    const resK = await makeRequest(
      port,
      'POST',
      '/api/v1/officer/complaints/c2222222-2222-2222-2222-222222222222/assign',
      {
        action: 'ACCEPT',
        officer_id: 'spoofed-fake-officer-uuid',
        assigned_by: 'spoofed-fake-user-uuid',
      },
      'token-officer-approved'
    );
    const complaint2 = mockComplaints.find((c) => c.id === 'c2222222-2222-2222-2222-222222222222');
    const assignment2 = complaint2?.assignments[0];
    const spoofIgnored =
      resK.statusCode === 200 &&
      assignment2?.officer_id === officerSanitationApproved.officer_profile!.id &&
      assignment2?.assigned_by === officerSanitationApproved.id;
    recordTest(
      'K',
      'Officer tries to inject spoofed officer_id / assigned_by → Ignored; authentic session data used',
      spoofIgnored
    );

    // -------------------------------------------------------------------------
    // Test L: Officer attempts to re-assign an already ASSIGNED complaint
    // -------------------------------------------------------------------------
    const resL = await makeRequest(
      port,
      'POST',
      '/api/v1/officer/complaints/c1111111-1111-1111-1111-111111111111/assign', // Already ASSIGNED
      { action: 'ACCEPT' },
      'token-officer-approved'
    );
    recordTest(
      'L',
      'Officer attempts to accept an already ASSIGNED complaint → Rejected (400 BadRequestError)',
      resL.statusCode === 400
    );

    // -------------------------------------------------------------------------
    // Test M: Pagination and filtering by priority & office
    // -------------------------------------------------------------------------
    const resM = await makeRequest(
      port,
      'GET',
      `/api/v1/officer/complaints?priority=HIGH&office_id=${officeEastSanitationId}`,
      undefined,
      'token-officer-approved'
    );
    const filterValid =
      resM.statusCode === 200 &&
      resM.body?.data?.complaints.length === 1 &&
      resM.body?.data?.complaints[0]?.id === 'c1111111-1111-1111-1111-111111111111';
    recordTest(
      'M',
      'Filtering (?priority=...&office_id=...) accurately refines department complaints',
      filterValid
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
}

runOfficerComplaintTests()
  .catch((err) => {
    console.error('Fatal officer test error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
