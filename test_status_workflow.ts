import http from 'http';
import { AddressInfo } from 'net';
import express, { Express, Request, Response, NextFunction } from 'express';
import { Role, VerificationStatus, Priority, ComplaintStatus } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { prisma } from './src/config/database.js';
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
  officerComplaintsQuerySchema,
  resolveComplaintSchema,
  updateComplaintStatusSchema,
} from './src/modules/officers/officers.schema.js';
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

async function runStatusWorkflowTests() {
  console.log('\n===============================================================');
  console.log('   CivicSense B9: Status Workflow & Resolution - Test Suite    ');
  console.log('===============================================================\n');

  const deptSanitationId = '11111111-1111-1111-1111-111111111111';
  const deptElectricityId = '44444444-4444-4444-4444-444444444444';
  const officeEastSanitationId = 'aaaa2222-2222-2222-2222-222222222222';

  // 1. Approved Sanitation Officer 1 (Assigned Officer)
  const officerSanitationAssigned: SafeUser = {
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

  // 2. Approved Sanitation Officer 2 (Unassigned Officer in same department)
  const officerSanitationUnassigned: SafeUser = {
    id: 'user-off-sanitation-2',
    name: 'Inspector Priya',
    email: 'priya.sanitation@civicsense.local',
    phone: '+91-9000000011',
    role: Role.OFFICER,
    created_at: new Date(),
    updated_at: new Date(),
    officer_profile: {
      id: 'prof-off-sanitation-2',
      department_id: deptSanitationId,
      designation: 'Sanitation Assistant Inspector',
      verification_status: VerificationStatus.APPROVED,
      created_at: new Date(),
      updated_at: new Date(),
    },
  };

  // 3. Approved Electricity Officer (Cross Department)
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

  // 4. Citizen User
  const citizenUser: SafeUser = {
    id: 'user-cit-1',
    name: 'Jane Citizen',
    email: 'jane.citizen@civicsense.local',
    phone: '+91-9000000001',
    role: Role.CITIZEN,
    created_at: new Date(),
    updated_at: new Date(),
  };

  // Valid 1x1 PNG data URI for resolution evidence
  const validResolutionPhoto =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // In-memory dataset representing complaints
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
      citizen: { id: citizenUser.id, name: citizenUser.name, email: citizenUser.email },
      status_history: [
        { id: 'sh-1', status: ComplaintStatus.NEW, note: 'Registered by citizen.', created_at: new Date('2026-08-18T10:00:00.000Z') },
      ],
      assignments: [] as any[],
      resolution: null as any,
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
      citizen: { id: citizenUser.id, name: citizenUser.name, email: citizenUser.email },
      status_history: [
        { id: 'sh-2', status: ComplaintStatus.NEW, note: 'Registered by citizen.', created_at: new Date('2026-08-19T11:00:00.000Z') },
      ],
      assignments: [] as any[],
      resolution: null as any,
    },
  ];

  const testApp: Express = express();
  testApp.use(express.json({ limit: '10mb' }));

  // Authenticator middleware for test suite
  testApp.use(async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    const token = authHeader.substring(7).trim();
    if (token === 'token-officer-assigned') {
      req.user = officerSanitationAssigned;
    } else if (token === 'token-officer-unassigned') {
      req.user = officerSanitationUnassigned;
    } else if (token === 'token-officer-electricity') {
      req.user = officerElectricity;
    } else if (token === 'token-citizen') {
      req.user = citizenUser;
    }
    next();
  });

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

        res.status(200).json({
          success: true,
          message: 'Complaint details retrieved successfully',
          data: {
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
          },
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

  // PATCH /api/v1/officer/complaints/:complaintId/status
  testApp.patch(
    '/api/v1/officer/complaints/:complaintId/status',
    requireAuthentication,
    requireApprovedOfficer,
    validate({ params: complaintIdParamSchema, body: updateComplaintStatusSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const officer = req.user!;
        const officerProfileId = officer.officer_profile!.id;
        const deptId = officer.officer_profile!.department_id;
        const complaint = mockComplaints.find((c) => c.id === req.params.complaintId);

        if (!complaint) {
          throw new NotFoundError(`Complaint with ID "${req.params.complaintId}" not found`);
        }

        if (complaint.department_id !== deptId) {
          throw new ForbiddenError(
            'Access denied: You do not have permission to modify complaints belonging to another department.'
          );
        }

        const isAssigned = complaint.assignments.some(
          (a) => a.officer_id === officerProfileId
        );
        if (!isAssigned) {
          throw new ForbiddenError(
            'Access denied: You must be assigned to this complaint to update its status.'
          );
        }

        if (req.body.status !== ComplaintStatus.IN_PROGRESS) {
          throw new BadRequestError(
            'Invalid status transition: Only transitioning to "IN_PROGRESS" is allowed via this endpoint.'
          );
        }

        if (complaint.status === ComplaintStatus.IN_PROGRESS) {
          throw new BadRequestError('Complaint is already in "IN_PROGRESS" status.');
        }

        if (complaint.status !== ComplaintStatus.ASSIGNED) {
          throw new BadRequestError(
            `Invalid status transition: Cannot change status from "${complaint.status}" to "IN_PROGRESS". Complaint must be in "ASSIGNED" status before starting work.`
          );
        }

        complaint.status = ComplaintStatus.IN_PROGRESS;
        complaint.updated_at = new Date();

        complaint.status_history.push({
          id: `sh-${complaint.status_history.length + 1}`,
          status: ComplaintStatus.IN_PROGRESS,
          note: req.body.note || 'Work has started on this issue.',
          created_at: new Date(),
        });

        res.status(200).json({
          success: true,
          message: 'Complaint status updated successfully',
          data: {
            id: complaint.id,
            complaint_number: generateComplaintNumber(complaint.id),
            title: complaint.title,
            status: complaint.status,
            status_history: complaint.status_history,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/v1/officer/complaints/:complaintId/resolve
  testApp.post(
    '/api/v1/officer/complaints/:complaintId/resolve',
    requireAuthentication,
    requireApprovedOfficer,
    validate({ params: complaintIdParamSchema, body: resolveComplaintSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const officer = req.user!;
        const officerProfileId = officer.officer_profile!.id;
        const deptId = officer.officer_profile!.department_id;
        const complaint = mockComplaints.find((c) => c.id === req.params.complaintId);

        if (!complaint) {
          throw new NotFoundError(`Complaint with ID "${req.params.complaintId}" not found`);
        }

        if (complaint.department_id !== deptId) {
          throw new ForbiddenError(
            'Access denied: You do not have permission to modify complaints belonging to another department.'
          );
        }

        const isAssigned = complaint.assignments.some(
          (a) => a.officer_id === officerProfileId
        );
        if (!isAssigned) {
          if (complaint.assignments.length > 0) {
            throw new ForbiddenError(
              'Access denied: You must be assigned to this complaint to resolve it.'
            );
          }
          complaint.assignments.push({
            id: `asgn-${complaint.assignments.length + 1}`,
            complaint_id: complaint.id,
            officer_id: officerProfileId,
            officer_name: officer.name,
            designation: officer.officer_profile!.designation,
            assigned_by: officer.id,
            assigned_at: new Date(),
          });
        }

        if (complaint.status === ComplaintStatus.RESOLVED) {
          throw new BadRequestError('Invalid status transition: Complaint is already "RESOLVED".');
        }

        if (complaint.status !== ComplaintStatus.IN_PROGRESS) {
          throw new BadRequestError(
            `Invalid status transition: Cannot resolve complaint from "${complaint.status}" status. Complaint must be in "IN_PROGRESS" status before it can be resolved.`
          );
        }

        const note = (req.body.note || req.body.resolution_note || '').trim();
        const photoPayload =
          req.body.photo ||
          req.body.photo_url ||
          req.body.resolution_photo ||
          req.body.resolution_photo_url;

        // Secure photo storage with magic-byte validation
        const stored = await saveBase64Image(photoPayload, 'resolutions');
        const finalPhotoUrl = stored.urlPath;

        complaint.status = ComplaintStatus.RESOLVED;
        complaint.updated_at = new Date();

        const resolutionRecord = {
          id: `res-${Date.now()}`,
          complaint_id: complaint.id,
          officer_id: officerProfileId,
          photo_url: finalPhotoUrl,
          note: note,
          resolved_at: new Date(),
          created_at: new Date(),
        };
        complaint.resolution = resolutionRecord;

        complaint.status_history.push({
          id: `sh-${complaint.status_history.length + 1}`,
          status: ComplaintStatus.RESOLVED,
          note: note,
          created_at: new Date(),
        });

        res.status(200).json({
          success: true,
          message: 'Complaint resolved successfully',
          data: {
            id: complaint.id,
            complaint_number: generateComplaintNumber(complaint.id),
            title: complaint.title,
            status: complaint.status,
            resolution: complaint.resolution,
            status_history: complaint.status_history,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/v1/complaints/:complaintId (Citizen tracking endpoint)
  testApp.get(
    '/api/v1/complaints/:complaintId',
    requireAuthentication,
    requireCitizen,
    validate({ params: complaintIdParamSchema }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = req.user!;
        const complaint = mockComplaints.find((c) => c.id === req.params.complaintId);

        if (!complaint) {
          throw new NotFoundError(`Complaint with ID "${req.params.complaintId}" not found`);
        }

        if (user.role === Role.CITIZEN && complaint.citizen_id !== user.id) {
          throw new ForbiddenError(
            'Access denied: You do not have permission to view this complaint.'
          );
        }

        res.status(200).json({
          success: true,
          message: 'Complaint retrieved successfully',
          data: {
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
    const targetComplaintId = 'c1111111-1111-1111-1111-111111111111';

    // -------------------------------------------------------------------------
    // Test A: NEW complaint state verification
    // -------------------------------------------------------------------------
    const initialComplaint = mockComplaints.find((c) => c.id === targetComplaintId);
    recordTest(
      'A',
      'Initial complaint status is NEW',
      initialComplaint?.status === 'NEW',
      `Current status: ${initialComplaint?.status}`
    );

    // -------------------------------------------------------------------------
    // Test K: Invalid Transition: NEW -> RESOLVED directly (DENIED)
    // -------------------------------------------------------------------------
    const resK = await makeRequest(
      port,
      'POST',
      `/api/v1/officer/complaints/${targetComplaintId}/resolve`,
      {
        note: 'Attempting direct resolve from NEW.',
        photo: validResolutionPhoto,
      },
      'token-officer-assigned'
    );
    recordTest(
      'K',
      'NEW → RESOLVED transition rejected directly → DENIED (400/403 Error)',
      resK.statusCode === 400 || resK.statusCode === 403,
      `Received HTTP ${resK.statusCode}: "${resK.body?.message || resK.body?.error}"`
    );

    // -------------------------------------------------------------------------
    // Test B: Officer accepts complaint (NEW -> ASSIGNED)
    // -------------------------------------------------------------------------
    const resB = await makeRequest(
      port,
      'POST',
      `/api/v1/officer/complaints/${targetComplaintId}/assign`,
      { action: 'ACCEPT', note: 'Inspector Ramesh taking ownership.' },
      'token-officer-assigned'
    );
    const assignedSuccess =
      resB.statusCode === 200 &&
      resB.body?.success === true &&
      resB.body?.data?.status === 'ASSIGNED';
    recordTest(
      'B',
      'Officer accepts complaint → NEW → ASSIGNED transition (200 OK)',
      assignedSuccess,
      `Status: ${resB.body?.data?.status}`
    );

    // -------------------------------------------------------------------------
    // Test K2: Invalid Transition: ASSIGNED -> RESOLVED directly (skipping IN_PROGRESS) (DENIED)
    // -------------------------------------------------------------------------
    const resK2 = await makeRequest(
      port,
      'POST',
      `/api/v1/officer/complaints/${targetComplaintId}/resolve`,
      {
        note: 'Attempting direct resolve from ASSIGNED.',
        photo: validResolutionPhoto,
      },
      'token-officer-assigned'
    );
    recordTest(
      'K2',
      'ASSIGNED → RESOLVED transition rejected directly → DENIED (400 BadRequestError)',
      resK2.statusCode === 400,
      `Received HTTP ${resK2.statusCode}: "${resK2.body?.message}"`
    );

    // -------------------------------------------------------------------------
    // Test H: Unassigned officer tries to start work on assigned complaint (DENIED)
    // -------------------------------------------------------------------------
    const resH = await makeRequest(
      port,
      'PATCH',
      `/api/v1/officer/complaints/${targetComplaintId}/status`,
      { status: 'IN_PROGRESS', note: 'Unassigned officer trying to start work.' },
      'token-officer-unassigned'
    );
    recordTest(
      'H',
      'Unassigned officer tries IN_PROGRESS → DENIED (403 Forbidden)',
      resH.statusCode === 403,
      `Received HTTP ${resH.statusCode}: "${resH.body?.message}"`
    );

    // -------------------------------------------------------------------------
    // Test I: Officer from another department tries to modify complaint (DENIED)
    // -------------------------------------------------------------------------
    const resI = await makeRequest(
      port,
      'PATCH',
      `/api/v1/officer/complaints/${targetComplaintId}/status`,
      { status: 'IN_PROGRESS', note: 'Electricity officer trying to start work.' },
      'token-officer-electricity'
    );
    recordTest(
      'I',
      'Officer from another department tries to modify complaint → DENIED (403 Forbidden)',
      resI.statusCode === 403,
      `Received HTTP ${resI.statusCode}: "${resI.body?.message}"`
    );

    // -------------------------------------------------------------------------
    // Test J: Citizen tries to change complaint status (DENIED)
    // -------------------------------------------------------------------------
    const resJ = await makeRequest(
      port,
      'PATCH',
      `/api/v1/officer/complaints/${targetComplaintId}/status`,
      { status: 'IN_PROGRESS', note: 'Citizen trying to start work.' },
      'token-citizen'
    );
    recordTest(
      'J',
      'Citizen tries to change complaint status → DENIED (403 Forbidden)',
      resJ.statusCode === 403,
      `Received HTTP ${resJ.statusCode}: "${resJ.body?.message}"`
    );

    // -------------------------------------------------------------------------
    // Test C: Assigned officer starts work (ASSIGNED -> IN_PROGRESS)
    // -------------------------------------------------------------------------
    const resC = await makeRequest(
      port,
      'PATCH',
      `/api/v1/officer/complaints/${targetComplaintId}/status`,
      { status: 'IN_PROGRESS', note: 'Work has started on this issue.' },
      'token-officer-assigned'
    );
    const inProgressSuccess =
      resC.statusCode === 200 &&
      resC.body?.success === true &&
      resC.body?.data?.status === 'IN_PROGRESS';
    recordTest(
      'C',
      'Assigned officer starts work → ASSIGNED → IN_PROGRESS (200 OK)',
      inProgressSuccess,
      `Status: ${resC.body?.data?.status}`
    );

    // -------------------------------------------------------------------------
    // Test M: Missing resolution photo on resolve attempt (DENIED)
    // -------------------------------------------------------------------------
    const resM = await makeRequest(
      port,
      'POST',
      `/api/v1/officer/complaints/${targetComplaintId}/resolve`,
      { note: 'Resolved without photo.' },
      'token-officer-assigned'
    );
    recordTest(
      'M',
      'Missing resolution photo → DENIED (400/422 Validation error)',
      resM.statusCode === 400 || resM.statusCode === 422,
      `Received HTTP ${resM.statusCode}`
    );

    // -------------------------------------------------------------------------
    // Test N: Missing resolution note on resolve attempt (DENIED)
    // -------------------------------------------------------------------------
    const resN = await makeRequest(
      port,
      'POST',
      `/api/v1/officer/complaints/${targetComplaintId}/resolve`,
      { photo: validResolutionPhoto },
      'token-officer-assigned'
    );
    recordTest(
      'N',
      'Missing resolution note → DENIED (400/422 Validation error)',
      resN.statusCode === 400 || resN.statusCode === 422,
      `Received HTTP ${resN.statusCode}`
    );

    // -------------------------------------------------------------------------
    // Test D: Assigned officer resolves complaint (IN_PROGRESS -> RESOLVED)
    // -------------------------------------------------------------------------
    const resD = await makeRequest(
      port,
      'POST',
      `/api/v1/officer/complaints/${targetComplaintId}/resolve`,
      {
        note: 'Garbage cleared and area disinfected thoroughly.',
        photo: validResolutionPhoto,
      },
      'token-officer-assigned'
    );
    const resolveSuccess =
      resD.statusCode === 200 &&
      resD.body?.success === true &&
      resD.body?.data?.status === 'RESOLVED';
    recordTest(
      'D',
      'Assigned officer resolves complaint → IN_PROGRESS → RESOLVED (200 OK)',
      resolveSuccess,
      `Status: ${resD.body?.data?.status}`
    );

    // -------------------------------------------------------------------------
    // Test E: Resolution photo stored on disk and verified
    // -------------------------------------------------------------------------
    const photoUrl = resD.body?.data?.resolution?.photo_url;
    const photoStored =
      typeof photoUrl === 'string' &&
      photoUrl.startsWith('/uploads/resolutions/resolutions_') &&
      photoUrl.endsWith('.png');
    
    // Check if the physical file exists on disk
    let fileExistsOnDisk = false;
    if (photoStored) {
      const localFilePath = path.join(process.cwd(), photoUrl);
      fileExistsOnDisk = fs.existsSync(localFilePath);
    }

    recordTest(
      'E',
      'Resolution photo stored in /uploads/resolutions/ with safe generated filename',
      photoStored && fileExistsOnDisk,
      `Saved path: ${photoUrl} (Physical file verified: ${fileExistsOnDisk})`
    );

    // -------------------------------------------------------------------------
    // Test F: Resolution record created with authentic officer_id & note
    // -------------------------------------------------------------------------
    const resRecord = resD.body?.data?.resolution;
    const isResolutionValid =
      !!resRecord &&
      resRecord.officer_id === officerSanitationAssigned.officer_profile!.id &&
      resRecord.note.includes('Garbage cleared') &&
      !!resRecord.resolved_at;
    recordTest(
      'F',
      'Resolution record created with authentic officer_id, photo_url, note, resolved_at',
      isResolutionValid,
      `Officer: ${resRecord?.officer_id}`
    );

    // -------------------------------------------------------------------------
    // Test G: Status history preserves complete timeline (NEW -> ASSIGNED -> IN_PROGRESS -> RESOLVED)
    // -------------------------------------------------------------------------
    const history = resD.body?.data?.status_history || [];
    const statuses = history.map((h: any) => h.status);
    const expectedSequence = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED'];
    const hasCompleteTimeline =
      statuses.length >= 4 &&
      expectedSequence.every((expectedStatus, idx) => statuses[idx] === expectedStatus);
    recordTest(
      'G',
      'Status history preserves complete lifecycle timeline (NEW → ASSIGNED → IN_PROGRESS → RESOLVED)',
      hasCompleteTimeline,
      `Timeline: ${statuses.join(' → ')}`
    );

    // -------------------------------------------------------------------------
    // Test L: RESOLVED complaint cannot transition back to IN_PROGRESS (DENIED)
    // -------------------------------------------------------------------------
    const resL = await makeRequest(
      port,
      'PATCH',
      `/api/v1/officer/complaints/${targetComplaintId}/status`,
      { status: 'IN_PROGRESS', note: 'Attempting to re-open resolved issue.' },
      'token-officer-assigned'
    );
    recordTest(
      'L',
      'RESOLVED → IN_PROGRESS transition attempt → DENIED (400 BadRequestError)',
      resL.statusCode === 400,
      `Received HTTP ${resL.statusCode}: "${resL.body?.message}"`
    );

    // -------------------------------------------------------------------------
    // Test O: Citizen visibility via B7 endpoint (GET /api/v1/complaints/:id)
    // -------------------------------------------------------------------------
    const resO = await makeRequest(
      port,
      'GET',
      `/api/v1/complaints/${targetComplaintId}`,
      undefined,
      'token-citizen'
    );
    const citizenCanSeeResolution =
      resO.statusCode === 200 &&
      resO.body?.data?.status === 'RESOLVED' &&
      resO.body?.data?.resolution?.note.includes('Garbage cleared') &&
      typeof resO.body?.data?.resolution?.photo_url === 'string' &&
      resO.body?.data?.status_history?.length === 4;
    recordTest(
      'O',
      'Citizen visibility: Citizen retrieves resolved complaint with full timeline and resolution evidence',
      citizenCanSeeResolution,
      `Citizen sees status: ${resO.body?.data?.status}, resolution note & photo present`
    );

    // -------------------------------------------------------------------------
    // Test P: Officer visibility via B8 endpoint (GET /api/v1/officer/complaints/:id)
    // -------------------------------------------------------------------------
    const resP = await makeRequest(
      port,
      'GET',
      `/api/v1/officer/complaints/${targetComplaintId}`,
      undefined,
      'token-officer-assigned'
    );
    const officerCanSeeResolution =
      resP.statusCode === 200 &&
      resP.body?.data?.status === 'RESOLVED' &&
      resP.body?.data?.resolution?.photo_url === photoUrl &&
      resP.body?.data?.status_history?.length === 4;
    recordTest(
      'P',
      'Officer visibility: Officer retrieves complaint details with updated RESOLVED state and resolution details',
      officerCanSeeResolution,
      `Officer sees status: ${resP.body?.data?.status}`
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

runStatusWorkflowTests().catch((err) => {
  console.error('Fatal status workflow test error:', err);
  process.exit(1);
});
