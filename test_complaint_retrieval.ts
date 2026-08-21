import http from 'http';
import { AddressInfo } from 'net';
import express, { Express, Request, Response, NextFunction } from 'express';
import { Role, VerificationStatus, Priority, ComplaintStatus } from '@prisma/client';
import { prisma } from './src/config/database.js';
import { SafeUser } from './src/modules/auth/auth.service.js';
import {
  requireAuthentication,
  requireCitizen,
} from './src/middlewares/auth.middleware.js';
import { validate } from './src/middlewares/validate.middleware.js';
import {
  complaintIdParamSchema,
  createComplaintSchema,
  myComplaintsQuerySchema,
  CreateComplaintInput,
  MyComplaintsQueryInput,
} from './src/modules/complaints/complaints.schema.js';
import {
  ComplaintsService,
  generateComplaintNumber,
} from './src/modules/complaints/complaints.service.js';
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

async function runComplaintRetrievalTests() {
  console.log('\n===============================================================');
  console.log('  CivicSense B7: Complaint Retrieval & Citizen Tracking Tests  ');
  console.log('===============================================================\n');

  const deptSanitationId = '11111111-1111-1111-1111-111111111111';
  const deptRoadsId = '22222222-2222-2222-2222-222222222222';

  const citizenA: SafeUser = {
    id: 'user-citizen-a',
    name: 'Aarav Sharma',
    email: 'aarav.sharma@civicsense.local',
    phone: '+91-9000000001',
    role: Role.CITIZEN,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const citizenB: SafeUser = {
    id: 'user-citizen-b',
    name: 'Bhavna Patel',
    email: 'bhavna.patel@civicsense.local',
    phone: '+91-9000000002',
    role: Role.CITIZEN,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const officerUser: SafeUser = {
    id: 'user-officer-1',
    name: 'Inspector Ramesh',
    email: 'ramesh.officer@civicsense.local',
    phone: '+91-9000000003',
    role: Role.OFFICER,
    created_at: new Date(),
    updated_at: new Date(),
    officer_profile: {
      id: 'prof-off-1',
      department_id: deptSanitationId,
      designation: 'Sanitation Officer',
      verification_status: VerificationStatus.APPROVED,
      created_at: new Date(),
      updated_at: new Date(),
    },
  };

  const mockComplaints = [
    {
      id: 'c1111111-1111-1111-1111-111111111111',
      citizen_id: citizenA.id,
      department_id: deptSanitationId,
      office_id: 'aaaa1111-1111-1111-1111-111111111111',
      title: 'Pothole on Main St (Citizen A)',
      description: 'Deep dangerous pothole near junction.',
      photo_url: '/uploads/complaints/pothole1.jpg',
      latitude: 12.9716,
      longitude: 77.5946,
      priority: Priority.HIGH,
      status: ComplaintStatus.RESOLVED,
      created_at: new Date('2026-08-10T10:00:00.000Z'),
      updated_at: new Date('2026-08-12T15:00:00.000Z'),
      department: { id: deptSanitationId, name: 'Municipality / Sanitation', description: 'Sanitation' },
      office: { id: 'aaaa1111-1111-1111-1111-111111111111', name: 'Central Office', address: 'Plot 101', latitude: 12.97, longitude: 77.59 },
      citizen: { id: citizenA.id, name: citizenA.name, email: citizenA.email },
      status_history: [
        { id: 'sh-1', status: ComplaintStatus.NEW, note: 'Registered by citizen', created_at: new Date('2026-08-10T10:00:00.000Z') },
        { id: 'sh-2', status: ComplaintStatus.ASSIGNED, note: 'Assigned to crew', created_at: new Date('2026-08-11T09:00:00.000Z') },
        { id: 'sh-3', status: ComplaintStatus.RESOLVED, note: 'Pothole filled and cured', created_at: new Date('2026-08-12T15:00:00.000Z') },
      ],
      resolution: {
        id: 'res-1',
        photo_url: '/uploads/resolutions/pothole_fixed.jpg',
        note: 'Road patch complete with bitumen.',
        resolved_at: new Date('2026-08-12T15:00:00.000Z'),
        created_at: new Date('2026-08-12T15:00:00.000Z'),
      },
    },
    {
      id: 'c2222222-2222-2222-2222-222222222222',
      citizen_id: citizenA.id,
      department_id: deptRoadsId,
      office_id: null,
      title: 'Damaged Sidewalk (Citizen A)',
      description: 'Pedestrian pavement broken up.',
      photo_url: null,
      latitude: null,
      longitude: null,
      priority: Priority.MEDIUM,
      status: ComplaintStatus.NEW,
      created_at: new Date('2026-08-15T12:00:00.000Z'),
      updated_at: new Date('2026-08-15T12:00:00.000Z'),
      department: { id: deptRoadsId, name: 'Roads & Infrastructure', description: 'Roads' },
      office: null,
      citizen: { id: citizenA.id, name: citizenA.name, email: citizenA.email },
      status_history: [
        { id: 'sh-4', status: ComplaintStatus.NEW, note: 'Registered by citizen', created_at: new Date('2026-08-15T12:00:00.000Z') },
      ],
      resolution: null,
    },
    {
      id: 'c3333333-3333-3333-3333-333333333333',
      citizen_id: citizenA.id,
      department_id: deptSanitationId,
      office_id: null,
      title: 'Garbage Dump Overflow (Citizen A)',
      description: 'Solid waste uncollected for 4 days.',
      photo_url: '/uploads/complaints/garbage.jpg',
      latitude: 12.98,
      longitude: 77.63,
      priority: Priority.MEDIUM,
      status: ComplaintStatus.NEW,
      created_at: new Date('2026-08-18T14:00:00.000Z'),
      updated_at: new Date('2026-08-18T14:00:00.000Z'),
      department: { id: deptSanitationId, name: 'Municipality / Sanitation', description: 'Sanitation' },
      office: null,
      citizen: { id: citizenA.id, name: citizenA.name, email: citizenA.email },
      status_history: [
        { id: 'sh-5', status: ComplaintStatus.NEW, note: 'Registered by citizen', created_at: new Date('2026-08-18T14:00:00.000Z') },
      ],
      resolution: null,
    },
    {
      id: 'c4444444-4444-4444-4444-444444444444',
      citizen_id: citizenB.id,
      department_id: deptSanitationId,
      office_id: null,
      title: 'Private Complaint (Citizen B)',
      description: 'Issue reported exclusively by Citizen B.',
      photo_url: null,
      latitude: 12.95,
      longitude: 77.58,
      priority: Priority.LOW,
      status: ComplaintStatus.NEW,
      created_at: new Date('2026-08-19T08:00:00.000Z'),
      updated_at: new Date('2026-08-19T08:00:00.000Z'),
      department: { id: deptSanitationId, name: 'Municipality / Sanitation', description: 'Sanitation' },
      office: null,
      citizen: { id: citizenB.id, name: citizenB.name, email: citizenB.email },
      status_history: [
        { id: 'sh-6', status: ComplaintStatus.NEW, note: 'Registered by citizen', created_at: new Date('2026-08-19T08:00:00.000Z') },
      ],
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
    if (token === 'token-citizen-a') {
      req.user = citizenA;
    } else if (token === 'token-citizen-b') {
      req.user = citizenB;
    } else if (token === 'token-officer') {
      req.user = officerUser;
    }
    next();
  });

  // GET /api/v1/complaints/my
  testApp.get(
    '/api/v1/complaints/my',
    requireAuthentication,
    requireCitizen,
    validate({ query: myComplaintsQuerySchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const citizen = req.user!;
        const query = req.query as any;
        const page = Math.max(1, parseInt(query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(query.limit) || 10));

        let filtered = mockComplaints.filter((c) => c.citizen_id === citizen.id);

        if (query.status) {
          filtered = filtered.filter((c) => c.status === query.status);
        }
        if (query.department_id) {
          filtered = filtered.filter((c) => c.department_id === query.department_id);
        }

        const total = filtered.length;
        const startIndex = (page - 1) * limit;
        const paged = filtered.slice(startIndex, startIndex + limit);

        const formatted = paged.map((c) => ({
          id: c.id,
          complaint_number: generateComplaintNumber(c.id),
          title: c.title,
          department: { id: c.department.id, name: c.department.name },
          office: c.office ? { id: c.office.id, name: c.office.name, address: c.office.address } : null,
          photo_url: c.photo_url,
          priority: c.priority,
          status: c.status,
          created_at: c.created_at,
          updated_at: c.updated_at,
        }));

        res.status(200).json({
          success: true,
          message: 'Citizen complaints retrieved successfully',
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

  // GET /api/v1/complaints/:complaintId
  testApp.get(
    '/api/v1/complaints/:complaintId',
    requireAuthentication,
    validate({ params: complaintIdParamSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = req.user!;
        const complaint = mockComplaints.find((c) => c.id === req.params.complaintId);

        if (!complaint) {
          throw new NotFoundError(`Complaint with ID "${req.params.complaintId}" not found`);
        }

        if (user.role === Role.CITIZEN && complaint.citizen_id !== user.id) {
          throw new ForbiddenError('Access denied: You do not have permission to view this complaint.');
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
          citizen: complaint.citizen,
          created_at: complaint.created_at,
          updated_at: complaint.updated_at,
          status_history: complaint.status_history,
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

  testApp.use(errorHandler);

  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  try {
    // -------------------------------------------------------------------------
    // Test A: Citizen retrieves own complaints list via GET /api/v1/complaints/my
    // -------------------------------------------------------------------------
    const resA = await makeRequest(port, 'GET', '/api/v1/complaints/my', undefined, 'token-citizen-a');
    const hasComplaints =
      resA.statusCode === 200 &&
      resA.body?.success === true &&
      Array.isArray(resA.body?.data?.complaints) &&
      resA.body?.data?.complaints.length === 3;
    recordTest(
      'A',
      'Citizen gets own complaints list via GET /api/v1/complaints/my → ALLOWED (200 OK)',
      hasComplaints,
      `Returned ${resA.body?.data?.complaints?.length} complaints for Citizen A`
    );

    // -------------------------------------------------------------------------
    // Test B: Citizen retrieves single complaint details with status history & resolution
    // -------------------------------------------------------------------------
    const resB = await makeRequest(
      port,
      'GET',
      '/api/v1/complaints/c1111111-1111-1111-1111-111111111111',
      undefined,
      'token-citizen-a'
    );
    const hasTimelineAndRes =
      resB.statusCode === 200 &&
      resB.body?.data?.id === 'c1111111-1111-1111-1111-111111111111' &&
      Array.isArray(resB.body?.data?.status_history) &&
      resB.body?.data?.status_history.length === 3 &&
      resB.body?.data?.resolution?.photo_url === '/uploads/resolutions/pothole_fixed.jpg';
    recordTest(
      'B',
      'Citizen gets own complaint details with status history and resolution → ALLOWED (200 OK)',
      hasTimelineAndRes
    );

    // -------------------------------------------------------------------------
    // Test C: Citizen attempts to retrieve another citizen's complaint
    // -------------------------------------------------------------------------
    const resC = await makeRequest(
      port,
      'GET',
      '/api/v1/complaints/c4444444-4444-4444-4444-444444444444', // Belongs to Citizen B
      undefined,
      'token-citizen-a' // Request by Citizen A
    );
    recordTest(
      'C',
      "Citizen attempts to view another citizen's complaint → DENIED (403 Forbidden)",
      resC.statusCode === 403
    );

    // -------------------------------------------------------------------------
    // Test D: Unauthenticated request to /my and /:complaintId
    // -------------------------------------------------------------------------
    const resD1 = await makeRequest(port, 'GET', '/api/v1/complaints/my');
    const resD2 = await makeRequest(port, 'GET', '/api/v1/complaints/c1111111-1111-1111-1111-111111111111');
    recordTest(
      'D',
      'Unauthenticated requests to /my and /:complaintId → DENIED (401 Unauthorized)',
      resD1.statusCode === 401 && resD2.statusCode === 401
    );

    // -------------------------------------------------------------------------
    // Test E: Officer attempting to access /my as a citizen
    // -------------------------------------------------------------------------
    const resE = await makeRequest(port, 'GET', '/api/v1/complaints/my', undefined, 'token-officer');
    recordTest(
      'E',
      'Officer attempting to use citizen-only /my endpoint → DENIED (403 Forbidden)',
      resE.statusCode === 403
    );

    // -------------------------------------------------------------------------
    // Test F: Citizen attempts to manipulate citizen_id in query
    // -------------------------------------------------------------------------
    const resF = await makeRequest(
      port,
      'GET',
      '/api/v1/complaints/my?citizen_id=user-citizen-b',
      undefined,
      'token-citizen-a'
    );
    const spoofIgnored =
      resF.statusCode === 200 &&
      resF.body?.data?.complaints.every((c: any) => c.title.includes('Citizen A'));
    recordTest(
      'F',
      'Citizen attempts to manipulate citizen_id query param → Ignored; returns strictly own complaints',
      spoofIgnored
    );

    // -------------------------------------------------------------------------
    // Test G: Pagination behavior
    // -------------------------------------------------------------------------
    const resG = await makeRequest(
      port,
      'GET',
      '/api/v1/complaints/my?page=1&limit=2',
      undefined,
      'token-citizen-a'
    );
    const paginationValid =
      resG.statusCode === 200 &&
      resG.body?.data?.complaints.length === 2 &&
      resG.body?.data?.pagination?.page === 1 &&
      resG.body?.data?.pagination?.limit === 2 &&
      resG.body?.data?.pagination?.total === 3 &&
      resG.body?.data?.pagination?.total_pages === 2;
    recordTest(
      'G',
      'Pagination returns accurate pages, limit, total, and total_pages metadata',
      paginationValid,
      `Page 1 of 2 (returned 2 of 3 total)`
    );

    // -------------------------------------------------------------------------
    // Test H: Status filter (e.g. ?status=RESOLVED and ?status=NEW)
    // -------------------------------------------------------------------------
    const resHResolved = await makeRequest(
      port,
      'GET',
      '/api/v1/complaints/my?status=RESOLVED',
      undefined,
      'token-citizen-a'
    );
    const isOnlyResolved =
      resHResolved.statusCode === 200 &&
      resHResolved.body?.data?.complaints.length === 1 &&
      resHResolved.body?.data?.complaints[0]?.status === 'RESOLVED';

    const resHNew = await makeRequest(
      port,
      'GET',
      '/api/v1/complaints/my?status=NEW',
      undefined,
      'token-citizen-a'
    );
    const isOnlyNew =
      resHNew.statusCode === 200 &&
      resHNew.body?.data?.complaints.length === 2 &&
      resHNew.body?.data?.complaints.every((c: any) => c.status === 'NEW');

    recordTest(
      'H',
      'Status filtering (?status=...) isolates matching complaints within citizen ownership',
      isOnlyResolved && isOnlyNew
    );

    // -------------------------------------------------------------------------
    // Test I: Department filter (e.g. ?department_id=...)
    // -------------------------------------------------------------------------
    const resIDept = await makeRequest(
      port,
      'GET',
      `/api/v1/complaints/my?department_id=${deptRoadsId}`,
      undefined,
      'token-citizen-a'
    );
    const isOnlyRoads =
      resIDept.statusCode === 200 &&
      resIDept.body?.data?.complaints.length === 1 &&
      resIDept.body?.data?.complaints[0]?.department?.id === deptRoadsId;
    recordTest(
      'I',
      'Department filtering (?department_id=...) returns matching department complaints',
      isOnlyRoads
    );

    // -------------------------------------------------------------------------
    // Test J: Resolution record null for unresolved complaints
    // -------------------------------------------------------------------------
    const resJ = await makeRequest(
      port,
      'GET',
      '/api/v1/complaints/c2222222-2222-2222-2222-222222222222',
      undefined,
      'token-citizen-a'
    );
    const isResolutionNull =
      resJ.statusCode === 200 &&
      resJ.body?.data?.resolution === null;
    recordTest(
      'J',
      'Unresolved complaint returns resolution: null',
      isResolutionNull
    );

    // -------------------------------------------------------------------------
    // Test K: Invalid complaintId UUID format
    // -------------------------------------------------------------------------
    const resK = await makeRequest(
      port,
      'GET',
      '/api/v1/complaints/not-a-valid-uuid',
      undefined,
      'token-citizen-a'
    );
    recordTest(
      'K',
      'Invalid complaintId UUID format → rejected (422 ValidationError)',
      resK.statusCode === 422
    );

    // -------------------------------------------------------------------------
    // Test L: Non-existent complaint UUID
    // -------------------------------------------------------------------------
    const resL = await makeRequest(
      port,
      'GET',
      '/api/v1/complaints/00000000-0000-0000-0000-000000000000',
      undefined,
      'token-citizen-a'
    );
    recordTest(
      'L',
      'Non-existent complaint UUID → returns (404 Not Found)',
      resL.statusCode === 404
    );

    // -------------------------------------------------------------------------
    // Test M: Invalid status filter in query parameter
    // -------------------------------------------------------------------------
    const resM = await makeRequest(
      port,
      'GET',
      '/api/v1/complaints/my?status=INVALID_STATUS_CODE',
      undefined,
      'token-citizen-a'
    );
    recordTest(
      'M',
      'Invalid status query parameter → rejected (422 ValidationError)',
      resM.statusCode === 422
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

runComplaintRetrievalTests()
  .catch((err) => {
    console.error('Fatal retrieval test error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
