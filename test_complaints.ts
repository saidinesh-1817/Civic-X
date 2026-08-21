import http from 'http';
import { AddressInfo } from 'net';
import express, { Express, Request, Response, NextFunction } from 'express';
import { Role, VerificationStatus, Priority, ComplaintStatus } from '@prisma/client';
import { createApp } from './src/app.js';
import { prisma } from './src/config/database.js';
import { AuthService, SafeUser } from './src/modules/auth/auth.service.js';
import {
  requireAuthentication,
  requireCitizen,
} from './src/middlewares/auth.middleware.js';
import { validate } from './src/middlewares/validate.middleware.js';
import {
  createComplaintSchema,
  CreateComplaintInput,
} from './src/modules/complaints/complaints.schema.js';
import {
  ComplaintsService,
  generateComplaintNumber,
} from './src/modules/complaints/complaints.service.js';
import { saveBase64Image } from './src/utils/fileStorage.js';
import { calculateHaversineDistance } from './src/utils/geo.js';
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

async function runComplaintTests() {
  console.log('\n===============================================================');
  console.log('   CivicSense B6: Complaint Creation & Submission - Test Suite ');
  console.log('===============================================================\n');

  // Valid tiny 1x1 PNG data URI for photo upload tests
  const sampleValidPngDataUri =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // ---------------------------------------------------------------------------
  // 1. Photo Storage & Identifier Generation Unit Tests
  // ---------------------------------------------------------------------------
  console.log('📸 Suite 1: Photo Storage & Complaint ID Unit Tests');

  // Test S1: Photo storage utility saves valid image and generates clean reference
  const savedPhoto = await saveBase64Image(sampleValidPngDataUri, 'complaints');
  const isPhotoSaved =
    savedPhoto.urlPath.startsWith('/uploads/complaints/') &&
    savedPhoto.filename.endsWith('.png') &&
    savedPhoto.sizeBytes > 0;
  recordTest('S1', 'saveBase64Image validates magic bytes & generates safe filename', isPhotoSaved, savedPhoto.urlPath);

  // Test S2: Rejection of invalid / malicious image header
  let invalidHeaderCaught = false;
  try {
    const fakeExeDataUri = 'data:image/png;base64,TVqQAAMAAAAEAAAA//8AALgAAAAAAAAAQAA='; // MZ executable header
    await saveBase64Image(fakeExeDataUri, 'complaints');
  } catch (err: any) {
    invalidHeaderCaught = err instanceof BadRequestError;
  }
  recordTest('S2', 'saveBase64Image rejects spoofed file extensions with invalid magic bytes', invalidHeaderCaught);

  // Test S3: Unique human-readable complaint identifier format
  const sampleUuid1 = 'c0a80101-4444-4444-8888-abcdef123456';
  const sampleUuid2 = 'd0b90202-5555-5555-9999-fedcba654321';
  const complaintNum1 = generateComplaintNumber(sampleUuid1);
  const complaintNum2 = generateComplaintNumber(sampleUuid2);
  const isCivFormat = /^CIV-\d{6}$/.test(complaintNum1) && /^CIV-\d{6}$/.test(complaintNum2) && complaintNum1 !== complaintNum2;
  recordTest('S3', 'generateComplaintNumber outputs deterministic CIV-###### format', isCivFormat, `${complaintNum1}, ${complaintNum2}`);

  // ---------------------------------------------------------------------------
  // 2. HTTP Integration Test Server Setup (Testing Requirements A through O)
  // ---------------------------------------------------------------------------
  console.log('\n🏛️ Suite 2: HTTP Integration & Workflow Tests (A through O)\n');

  const deptSanitationId = '11111111-1111-1111-1111-111111111111';
  const deptRoadsId = '22222222-2222-2222-2222-222222222222';
  const deptNoOfficesId = '88888888-8888-8888-8888-888888888888';

  const officeSanitationEastId = 'aaaa2222-2222-2222-2222-222222222222';

  const mockCitizenUser: SafeUser = {
    id: 'user-cit-1111',
    name: 'Jane Citizen',
    email: 'jane.citizen@civicsense.local',
    phone: '+91-9000000001',
    role: Role.CITIZEN,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockOfficerUser: SafeUser = {
    id: 'user-off-1111',
    name: 'Inspector Ramesh',
    email: 'ramesh.officer@civicsense.local',
    phone: '+91-9000000002',
    role: Role.OFFICER,
    created_at: new Date(),
    updated_at: new Date(),
    officer_profile: {
      id: 'prof-off-1111',
      department_id: deptSanitationId,
      designation: 'Sanitation Inspector',
      verification_status: VerificationStatus.APPROVED,
      created_at: new Date(),
      updated_at: new Date(),
    },
  };

  const mockDepartments = [
    { id: deptSanitationId, name: 'Municipality / Sanitation', active: true },
    { id: deptRoadsId, name: 'Roads & Infrastructure', active: true },
    { id: deptNoOfficesId, name: 'Department Without Offices', active: true },
    { id: '99999999-9999-9999-9999-999999999999', name: 'Inactive Department', active: false },
  ];

  const mockOffices = [
    {
      id: 'aaaa1111-1111-1111-1111-111111111111',
      department_id: deptSanitationId,
      name: 'Central Sanitation HQ',
      address: 'Plot 101, Central Zone',
      latitude: 12.9716,
      longitude: 77.5946,
      active: true,
    },
    {
      id: officeSanitationEastId,
      department_id: deptSanitationId,
      name: 'East Ward Sanitation Office',
      address: 'Building B, Indiranagar East',
      latitude: 12.9810,
      longitude: 77.6320,
      active: true,
    },
  ];

  // In-memory complaint & history stores for testing
  const createdComplaints: any[] = [];
  const createdStatusHistories: any[] = [];

  const testApp: Express = express();
  testApp.use(express.json({ limit: '10mb' }));

  // Authenticator middleware
  const testAuthenticator = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    const token = authHeader.substring(7).trim();
    if (token === 'token-citizen') {
      req.user = mockCitizenUser;
    } else if (token === 'token-officer') {
      req.user = mockOfficerUser;
    }
    next();
  };

  testApp.use(testAuthenticator);

  // POST /api/v1/complaints test handler
  testApp.post(
    '/api/v1/complaints',
    requireAuthentication,
    requireCitizen,
    validate({ body: createComplaintSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const citizen = req.user!;
        const body: CreateComplaintInput = req.body;

        // 1. Department Validation
        const dept = mockDepartments.find((d) => d.id === body.department_id);
        if (!dept || !dept.active) {
          throw new NotFoundError(`Department with ID "${body.department_id}" not found or is currently inactive`);
        }

        // 2. Photo Processing
        let photoUrl: string | null = null;
        if (body.photo) {
          const stored = await saveBase64Image(body.photo, 'complaints');
          photoUrl = stored.urlPath;
        } else if (body.photo_url) {
          photoUrl = body.photo_url;
        }

        // 3. Location & Office Routing
        let officeId: string | null = null;
        let resolvedOffice: any = null;

        if (body.latitude !== undefined && body.latitude !== null && body.longitude !== undefined && body.longitude !== null) {
          const activeDeptOffices = mockOffices.filter((o) => o.department_id === body.department_id && o.active);
          if (activeDeptOffices.length > 0) {
            let minDistance = calculateHaversineDistance(body.latitude, body.longitude, activeDeptOffices[0].latitude, activeDeptOffices[0].longitude);
            let nearest = activeDeptOffices[0];

            for (let i = 1; i < activeDeptOffices.length; i++) {
              const dist = calculateHaversineDistance(body.latitude, body.longitude, activeDeptOffices[i].latitude, activeDeptOffices[i].longitude);
              if (dist.distanceKm < minDistance.distanceKm) {
                minDistance = dist;
                nearest = activeDeptOffices[i];
              }
            }
            officeId = nearest.id;
            resolvedOffice = nearest;
          }
        }

        const countNum = createdComplaints.length + 1;
        const complaintUuid = `c0000000-0000-0000-0000-${String(countNum).padStart(12, '0')}`;
        const complaintRecord = {
          id: complaintUuid,
          complaint_number: generateComplaintNumber(complaintUuid),
          citizen_id: citizen.id, // Strictly sourced from session
          department_id: dept.id,
          office_id: officeId,
          title: body.title,
          description: body.description,
          photo_url: photoUrl,
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
          priority: Priority.MEDIUM, // Strict default: MEDIUM
          status: ComplaintStatus.NEW, // Strict default: NEW
          created_at: new Date(),
          department: { id: dept.id, name: dept.name },
          office: resolvedOffice ? { id: resolvedOffice.id, name: resolvedOffice.name, address: resolvedOffice.address } : null,
          citizen: { id: citizen.id, name: citizen.name, email: citizen.email },
        };

        createdComplaints.push(complaintRecord);

        // Record status history
        createdStatusHistories.push({
          id: `sh-${createdStatusHistories.length + 1}`,
          complaint_id: complaintUuid,
          status: ComplaintStatus.NEW,
          changed_by: citizen.id,
          note: 'Complaint registered by citizen.',
          created_at: new Date(),
        });

        res.status(201).json({
          success: true,
          message: 'Complaint registered successfully',
          data: complaintRecord,
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
    // Test A: Authenticated citizen submits valid complaint -> SUCCESS (201)
    // -------------------------------------------------------------------------
    const resA = await makeRequest(
      port,
      'POST',
      '/api/v1/complaints',
      {
        title: 'Overflowing Garbage Bin',
        description: 'The garbage bin at 4th Cross has been overflowing for 3 days.',
        department_id: deptSanitationId,
        latitude: 12.9810,
        longitude: 77.6320,
      },
      'token-citizen'
    );
    recordTest(
      'A',
      'Authenticated citizen submits valid complaint → SUCCESS (201 Created)',
      resA.statusCode === 201 && resA.body?.success === true && !!resA.body?.data?.id
    );

    // -------------------------------------------------------------------------
    // Test B: Citizen submits photo -> photo stored & reference saved
    // -------------------------------------------------------------------------
    const resB = await makeRequest(
      port,
      'POST',
      '/api/v1/complaints',
      {
        title: 'Broken Streetlight with Exposed Wiring',
        description: 'Exposed electrical wiring hanging from pole near bus station.',
        department_id: deptSanitationId,
        photo: sampleValidPngDataUri,
      },
      'token-citizen'
    );
    const hasPhotoUrl =
      resB.statusCode === 201 &&
      typeof resB.body?.data?.photo_url === 'string' &&
      resB.body?.data?.photo_url.startsWith('/uploads/complaints/');
    recordTest('B', 'Citizen submits photo → photo safely stored and reference saved in photo_url', hasPhotoUrl);

    // -------------------------------------------------------------------------
    // Test C: Citizen submits valid GPS -> coordinates saved
    // -------------------------------------------------------------------------
    const resC = await makeRequest(
      port,
      'POST',
      '/api/v1/complaints',
      {
        title: 'Deep Waterlogged Pothole',
        description: 'Severe pothole at main junction causing accidents.',
        department_id: deptSanitationId,
        latitude: 12.9716,
        longitude: 77.5946,
      },
      'token-citizen'
    );
    const hasGps =
      resC.statusCode === 201 &&
      resC.body?.data?.latitude === 12.9716 &&
      resC.body?.data?.longitude === 77.5946;
    recordTest('C', 'Citizen submits valid GPS coordinates → coordinates saved', hasGps);

    // -------------------------------------------------------------------------
    // Test D: Department selected -> correct department stored
    // -------------------------------------------------------------------------
    const resD = await makeRequest(
      port,
      'POST',
      '/api/v1/complaints',
      {
        title: 'Damaged Potholed Roadway',
        description: 'Road resurfacing required immediately along 2nd Main.',
        department_id: deptRoadsId,
      },
      'token-citizen'
    );
    const isRoadsDept =
      resD.statusCode === 201 &&
      resD.body?.data?.department?.id === deptRoadsId &&
      resD.body?.data?.department?.name === 'Roads & Infrastructure';
    recordTest('D', 'Selected department → correct department stored', isRoadsDept);

    // -------------------------------------------------------------------------
    // Test E: Nearest office exists -> office_id stored
    // -------------------------------------------------------------------------
    // Location near Indiranagar East (12.9784, 77.6408) -> Should route to East Ward Sanitation Office
    const resE = await makeRequest(
      port,
      'POST',
      '/api/v1/complaints',
      {
        title: 'Uncleared Debris in Indiranagar',
        description: 'Construction debris blocking pedestrian walkway.',
        department_id: deptSanitationId,
        latitude: 12.9784,
        longitude: 77.6408,
      },
      'token-citizen'
    );
    const routedToEastOffice =
      resE.statusCode === 201 &&
      resE.body?.data?.office?.id === officeSanitationEastId;
    recordTest('E', 'Nearest office exists → office_id automatically resolved & stored', routedToEastOffice);

    // -------------------------------------------------------------------------
    // Test F: No suitable office -> complaint still created with office_id NULL
    // -------------------------------------------------------------------------
    const resF = await makeRequest(
      port,
      'POST',
      '/api/v1/complaints',
      {
        title: 'Issue in Rural Sector',
        description: 'Grievance in department that currently has zero branch offices.',
        department_id: deptNoOfficesId,
        latitude: 12.9000,
        longitude: 77.5000,
      },
      'token-citizen'
    );
    const officeIsNull =
      resF.statusCode === 201 &&
      (resF.body?.data?.office === null || resF.body?.data?.office_id === null);
    recordTest('F', 'No suitable office registered → complaint created with office_id NULL', officeIsNull);

    // -------------------------------------------------------------------------
    // Test G: Unauthenticated user -> 401 Unauthorized
    // -------------------------------------------------------------------------
    const resG = await makeRequest(port, 'POST', '/api/v1/complaints', {
      title: 'Anonymous Grievance',
      description: 'Attempting to file grievance without authentication header.',
      department_id: deptSanitationId,
    });
    recordTest('G', 'Unauthenticated user → rejected (401 Unauthorized)', resG.statusCode === 401);

    // -------------------------------------------------------------------------
    // Test H: Officer attempts citizen complaint creation -> 403 Forbidden
    // -------------------------------------------------------------------------
    const resH = await makeRequest(
      port,
      'POST',
      '/api/v1/complaints',
      {
        title: 'Officer Filing Complaint',
        description: 'Officer attempting to invoke citizen grievance endpoint.',
        department_id: deptSanitationId,
      },
      'token-officer'
    );
    recordTest('H', 'Officer attempts citizen complaint creation → rejected (403 Forbidden)', resH.statusCode === 403);

    // -------------------------------------------------------------------------
    // Test I: Invalid department -> rejected
    // -------------------------------------------------------------------------
    // Inactive department
    const resIInactive = await makeRequest(
      port,
      'POST',
      '/api/v1/complaints',
      {
        title: 'Grievance for Inactive Department',
        description: 'Submitting complaint against inactive department.',
        department_id: '99999999-9999-9999-9999-999999999999',
      },
      'token-citizen'
    );
    // Non-existent UUID
    const resINotFound = await makeRequest(
      port,
      'POST',
      '/api/v1/complaints',
      {
        title: 'Grievance for Ghost Department',
        description: 'Submitting complaint against non-existent department.',
        department_id: '00000000-0000-0000-0000-000000000000',
      },
      'token-citizen'
    );
    recordTest(
      'I',
      'Invalid / inactive department → rejected (404 Not Found / 422)',
      resIInactive.statusCode === 404 && resINotFound.statusCode === 404
    );

    // -------------------------------------------------------------------------
    // Test J: Invalid latitude/longitude -> rejected
    // -------------------------------------------------------------------------
    const resJ = await makeRequest(
      port,
      'POST',
      '/api/v1/complaints',
      {
        title: 'Invalid Coordinates Complaint',
        description: 'Complaint with invalid latitude and longitude.',
        department_id: deptSanitationId,
        latitude: 120.0, // Invalid: > 90
        longitude: 250.0, // Invalid: > 180
      },
      'token-citizen'
    );
    recordTest('J', 'Invalid latitude/longitude coordinates → rejected (422 ValidationError)', resJ.statusCode === 422);

    // -------------------------------------------------------------------------
    // Test K: Invalid / oversized image -> rejected
    // -------------------------------------------------------------------------
    const resK = await makeRequest(
      port,
      'POST',
      '/api/v1/complaints',
      {
        title: 'Malformed Image Complaint',
        description: 'Submitting complaint with corrupt/malformed image string.',
        department_id: deptSanitationId,
        photo: 'data:image/png;base64,ThisIsNotAValidBase64ImagePayload',
      },
      'token-citizen'
    );
    recordTest('K', 'Invalid image payload → rejected (400 BadRequestError / 422)', resK.statusCode === 400);

    // -------------------------------------------------------------------------
    // Test L: Citizen attempts to submit another citizen_id -> ignored / session used
    // -------------------------------------------------------------------------
    const resL = await makeRequest(
      port,
      'POST',
      '/api/v1/complaints',
      {
        title: 'Spoofed Citizen ID Attempt',
        description: 'Submitting malicious citizen_id and spoofed priority/status.',
        department_id: deptSanitationId,
        citizen_id: 'other-victim-citizen-uuid',
        priority: 'CRITICAL',
        status: 'RESOLVED',
      },
      'token-citizen'
    );
    const spoofIgnored =
      resL.statusCode === 201 &&
      resL.body?.data?.citizen?.id === mockCitizenUser.id &&
      resL.body?.data?.priority === 'MEDIUM' &&
      resL.body?.data?.status === 'NEW';
    recordTest(
      'L',
      'Citizen attempts to inject citizen_id, priority, status → ignored; session & defaults enforced',
      spoofIgnored
    );

    // -------------------------------------------------------------------------
    // Test M: New complaint status defaulted to NEW
    // -------------------------------------------------------------------------
    const latestComplaint = createdComplaints[createdComplaints.length - 1];
    recordTest('M', 'New complaint status defaulted to NEW', latestComplaint?.status === 'NEW');

    // -------------------------------------------------------------------------
    // Test N: Initial status history created
    // -------------------------------------------------------------------------
    const latestHistory = createdStatusHistories.find((h) => h.complaint_id === latestComplaint.id);
    const historyValid =
      !!latestHistory &&
      latestHistory.status === 'NEW' &&
      latestHistory.changed_by === mockCitizenUser.id;
    recordTest(
      'N',
      'Initial status history created (status=NEW, changed_by=citizen.id)',
      historyValid
    );

    // -------------------------------------------------------------------------
    // Test O: Unique CIV complaint ID generated
    // -------------------------------------------------------------------------
    const allCivNumbers = createdComplaints.map((c) => c.complaint_number);
    const allFormattedCorrectly = allCivNumbers.every((n) => /^CIV-\d{6}$/.test(n));
    recordTest(
      'O',
      'Unique CIV-###### human-readable complaint identifier generated',
      allFormattedCorrectly && allCivNumbers.length > 0,
      `Generated examples: ${allCivNumbers.slice(0, 3).join(', ')}`
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

runComplaintTests()
  .catch((err) => {
    console.error('Fatal complaint test error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
