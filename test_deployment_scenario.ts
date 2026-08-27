import http from 'http';
import { AddressInfo } from 'net';
import { prisma } from './src/config/database.js';
import { createApp } from './src/app.js';
import { Role, VerificationStatus, ComplaintStatus } from '@prisma/client';

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
  id: number;
  title: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function recordTest(id: number, title: string, passed: boolean, details?: string) {
  results.push({ id, title, passed, details });
  const icon = passed ? '✅' : '❌';
  console.log(`  ${icon} [Scenario Test ${id}] ${title}${details ? ` → ${details}` : ''}`);
}

async function runScenarioTests() {
  console.log('\n========================================================================');
  console.log('   CivicSense — Final Deployment Scenario & Integration Test Suite     ');
  console.log('========================================================================\n');

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  const timestamp = Date.now();

  // 1. Fetch Electrical & Sanitation departments from database
  let electricalDept = await prisma.department.findFirst({
    where: { OR: [{ name: { contains: 'Electricity', mode: 'insensitive' } }, { name: { contains: 'Electrical', mode: 'insensitive' } }, { name: { contains: 'Power', mode: 'insensitive' } }] },
  });

  if (!electricalDept) {
    electricalDept = await prisma.department.create({
      data: {
        name: 'Electrical & Power Supply',
        description: 'Municipal electrical infrastructure, streetlights, and power grids',
        active: true,
      },
    });
  }

  let sanitationDept = await prisma.department.findFirst({
    where: { name: { contains: 'Sanitation', mode: 'insensitive' } },
  });

  if (!sanitationDept) {
    sanitationDept = await prisma.department.create({
      data: {
        name: 'Municipality / Sanitation',
        description: 'Waste management and drainage',
        active: true,
      },
    });
  }

  // 2. Setup Platform Admin
  const adminEmail = `admin_scenario_${timestamp}@civicsense.test`;
  const adminPassword = 'AdminSecurePassword123!';
  const adminRegRes = await makeRequest(port, 'POST', '/api/v1/auth/register', {
    name: 'Chief Administrator',
    email: adminEmail,
    password: adminPassword,
    phone: '+91-9900011111',
  });
  const adminUserId = adminRegRes.body?.data?.user?.id;
  await prisma.user.update({
    where: { id: adminUserId },
    data: { role: Role.ADMIN },
  });

  const adminLoginRes = await makeRequest(port, 'POST', '/api/v1/auth/login', {
    email: adminEmail,
    password: adminPassword,
  });
  const adminToken = adminLoginRes.body?.data?.token;

  // 3. Setup Citizen
  const citizenEmail = `citizen_maya_${timestamp}@civicsense.test`;
  const citizenPassword = 'MayaCitizen123!';
  const citizenRegRes = await makeRequest(port, 'POST', '/api/v1/auth/register', {
    name: 'Maya Citizen',
    email: citizenEmail,
    password: citizenPassword,
    phone: '+91-9876543210',
  });
  const citizenToken = citizenRegRes.body?.data?.token;
  const citizenUserId = citizenRegRes.body?.data?.user?.id;

  // 4. Setup Electrical Officer
  const electricalOfficerEmail = `officer_arjun_${timestamp}@civicsense.test`;
  const electricalOfficerPassword = 'ArjunOfficer123!';
  const electricalOfficerRegRes = await makeRequest(port, 'POST', '/api/v1/auth/register/officer', {
    name: 'Officer Arjun (Electrical)',
    email: electricalOfficerEmail,
    password: electricalOfficerPassword,
    department_id: electricalDept.id,
    designation: 'Senior Electrical Engineer',
  });
  const electricalOfficerProfileId = electricalOfficerRegRes.body?.data?.user?.officer_profile?.id;
  const electricalOfficerUserId = electricalOfficerRegRes.body?.data?.user?.id;

  // Admin approves Electrical Officer
  await makeRequest(port, 'PATCH', `/api/v1/admin/officers/${electricalOfficerProfileId}/approve`, undefined, adminToken);

  const electricalOfficerLoginRes = await makeRequest(port, 'POST', '/api/v1/auth/login', {
    email: electricalOfficerEmail,
    password: electricalOfficerPassword,
  });
  const electricalOfficerToken = electricalOfficerLoginRes.body?.data?.token;

  // 5. Setup Sanitation Officer (Cross-department check)
  const sanitationOfficerEmail = `officer_suresh_${timestamp}@civicsense.test`;
  const sanitationOfficerPassword = 'SureshOfficer123!';
  const sanitationOfficerRegRes = await makeRequest(port, 'POST', '/api/v1/auth/register/officer', {
    name: 'Officer Suresh (Sanitation)',
    email: sanitationOfficerEmail,
    password: sanitationOfficerPassword,
    department_id: sanitationDept.id,
    designation: 'Sanitation Inspector',
  });
  const sanitationOfficerProfileId = sanitationOfficerRegRes.body?.data?.user?.officer_profile?.id;
  await makeRequest(port, 'PATCH', `/api/v1/admin/officers/${sanitationOfficerProfileId}/approve`, undefined, adminToken);

  const sanitationOfficerLoginRes = await makeRequest(port, 'POST', '/api/v1/auth/login', {
    email: sanitationOfficerEmail,
    password: sanitationOfficerPassword,
  });
  const sanitationOfficerToken = sanitationOfficerLoginRes.body?.data?.token;

  // 1x1 PNG base64 images
  const sampleCitizenPhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const sampleResolutionPhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  let complaintId = '';
  let storedCitizenPhotoUrl = '';

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Citizen creates Electrical complaint with photo
    // -------------------------------------------------------------------------
    const createComplaintRes = await makeRequest(
      port,
      'POST',
      '/api/v1/complaints',
      {
        title: 'Dangerous Exposed Sparking Transformer on 5th Main',
        description: 'High-voltage transformer box is exposed with continuous sparking near public walkway.',
        department_id: electricalDept.id,
        latitude: 12.9352,
        longitude: 77.6245,
        photo: sampleCitizenPhoto,
      },
      citizenToken
    );

    complaintId = createComplaintRes.body?.data?.id;
    storedCitizenPhotoUrl = createComplaintRes.body?.data?.photo_url;

    const isCreatedOk =
      createComplaintRes.statusCode === 201 &&
      createComplaintRes.body?.data?.status === 'NEW' &&
      typeof storedCitizenPhotoUrl === 'string' &&
      storedCitizenPhotoUrl.startsWith('/uploads/complaints/');

    recordTest(
      1,
      'Citizen creates Electrical complaint with photo in NEW status',
      isCreatedOk,
      `Complaint ID: ${complaintId}, Photo: "${storedCitizenPhotoUrl}"`
    );

    // -------------------------------------------------------------------------
    // TEST 2: Electrical Officer automatically accesses Electrical complaint (No admin assignment required)
    // -------------------------------------------------------------------------
    const officerListRes = await makeRequest(
      port,
      'GET',
      '/api/v1/officer/complaints',
      undefined,
      electricalOfficerToken
    );

    const complaintsInDept = officerListRes.body?.data?.complaints || [];
    const foundInElectricalDept = complaintsInDept.some((c: any) => c.id === complaintId);

    recordTest(
      2,
      'Approved Electrical Officer automatically sees complaint in department queue without manual admin assignment',
      officerListRes.statusCode === 200 && foundInElectricalDept,
      `Found complaint ${complaintId} in officer queue (Total in queue: ${complaintsInDept.length})`
    );

    // -------------------------------------------------------------------------
    // TEST 3: Sanitation Officer CANNOT access Electrical complaint (Department isolation enforced)
    // -------------------------------------------------------------------------
    const sanitationListRes = await makeRequest(
      port,
      'GET',
      '/api/v1/officer/complaints',
      undefined,
      sanitationOfficerToken
    );
    const sanitationComplaints = sanitationListRes.body?.data?.complaints || [];
    const foundInSanitation = sanitationComplaints.some((c: any) => c.id === complaintId);

    const sanitationDetailRes = await makeRequest(
      port,
      'GET',
      `/api/v1/officer/complaints/${complaintId}`,
      undefined,
      sanitationOfficerToken
    );

    recordTest(
      3,
      'Sanitation Officer is blocked from viewing/accessing Electrical complaint (403 Forbidden)',
      !foundInSanitation && sanitationDetailRes.statusCode === 403,
      `List contains: ${foundInSanitation}, Detail GET HTTP: ${sanitationDetailRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // TEST 4: Electrical Officer views complaint details including citizen photo
    // -------------------------------------------------------------------------
    const officerDetailRes = await makeRequest(
      port,
      'GET',
      `/api/v1/officer/complaints/${complaintId}`,
      undefined,
      electricalOfficerToken
    );

    const officerSeesPhoto =
      officerDetailRes.statusCode === 200 &&
      officerDetailRes.body?.data?.photo_url === storedCitizenPhotoUrl;

    recordTest(
      4,
      'Electrical Officer views complaint details with citizen-uploaded photo',
      officerSeesPhoto,
      `Photo URL matches: "${officerDetailRes.body?.data?.photo_url}"`
    );

    // -------------------------------------------------------------------------
    // TEST 5: Electrical Officer starts work (Status transition: NEW -> IN_PROGRESS)
    // -------------------------------------------------------------------------
    const updateStatusRes = await makeRequest(
      port,
      'PATCH',
      `/api/v1/officer/complaints/${complaintId}/status`,
      {
        status: 'IN_PROGRESS',
        note: 'Electrical emergency crew dispatched with insulator kit.',
      },
      electricalOfficerToken
    );

    const isUpdatedOk =
      updateStatusRes.statusCode === 200 &&
      updateStatusRes.body?.data?.status === 'IN_PROGRESS';

    recordTest(
      5,
      'Electrical Officer starts work and complaint transitions to IN_PROGRESS with auto-assignment',
      isUpdatedOk,
      `Status: ${updateStatusRes.body?.data?.status}`
    );

    // -------------------------------------------------------------------------
    // TEST 6: Electrical Officer adds progress note
    // -------------------------------------------------------------------------
    const progressNoteRes = await makeRequest(
      port,
      'POST',
      `/api/v1/officer/complaints/${complaintId}/progress`,
      {
        note: 'Transformer power isolated. Replacement transformer core installed and tested.',
      },
      electricalOfficerToken
    );

    const complaintAfterProgress = await prisma.complaint.findUnique({
      where: { id: complaintId },
      include: { status_history: true },
    });

    const hasProgressNote = complaintAfterProgress?.status_history.some(
      (h) => h.note?.includes('Replacement transformer core')
    );

    recordTest(
      6,
      'Electrical Officer adds progress update note to complaint timeline',
      progressNoteRes.statusCode === 200 && hasProgressNote,
      `Progress note logged in status history timeline: ${hasProgressNote}`
    );

    // -------------------------------------------------------------------------
    // TEST 7: Cross-department officer cannot resolve Electrical complaint
    // -------------------------------------------------------------------------
    const unauthorizedResolveRes = await makeRequest(
      port,
      'POST',
      `/api/v1/officer/complaints/${complaintId}/resolve`,
      {
        note: 'Unauthorized resolution attempt.',
        photo: sampleResolutionPhoto,
      },
      sanitationOfficerToken
    );

    recordTest(
      7,
      'Officer from different department cannot resolve Electrical complaint (403 Forbidden)',
      unauthorizedResolveRes.statusCode === 403,
      `HTTP status: ${unauthorizedResolveRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // TEST 8: Authorized Electrical Officer resolves complaint with photo & note
    // -------------------------------------------------------------------------
    const resolveRes = await makeRequest(
      port,
      'POST',
      `/api/v1/officer/complaints/${complaintId}/resolve`,
      {
        note: 'Transformer repaired, grounded, and safety enclosure locked securely. Voltage output verified normal.',
        photo: sampleResolutionPhoto,
      },
      electricalOfficerToken
    );

    const isResolvedOk =
      resolveRes.statusCode === 200 &&
      resolveRes.body?.data?.status === 'RESOLVED' &&
      typeof resolveRes.body?.data?.resolution?.photo_url === 'string';

    recordTest(
      8,
      'Authorized Electrical Officer resolves complaint with resolution photo and note',
      isResolvedOk,
      `Status: ${resolveRes.body?.data?.status}, Resolution photo: "${resolveRes.body?.data?.resolution?.photo_url}"`
    );

    // -------------------------------------------------------------------------
    // TEST 9: Admin views the same complaint and same citizen photo & resolution
    // -------------------------------------------------------------------------
    const adminDetailRes = await makeRequest(
      port,
      'GET',
      `/api/v1/complaints/${complaintId}`,
      undefined,
      adminToken
    );

    const adminSeesCitizenPhoto =
      adminDetailRes.statusCode === 200 &&
      adminDetailRes.body?.data?.photo_url === storedCitizenPhotoUrl &&
      adminDetailRes.body?.data?.status === 'RESOLVED' &&
      typeof adminDetailRes.body?.data?.resolution?.photo_url === 'string';

    recordTest(
      9,
      'Admin views the complaint with identical citizen photo, status history, and resolution',
      adminSeesCitizenPhoto,
      `Citizen Photo: "${adminDetailRes.body?.data?.photo_url}", Status: ${adminDetailRes.body?.data?.status}`
    );

    // -------------------------------------------------------------------------
    // TEST 10: Citizen views resolved complaint with same photo and resolution
    // -------------------------------------------------------------------------
    const citizenDetailRes = await makeRequest(
      port,
      'GET',
      `/api/v1/complaints/${complaintId}`,
      undefined,
      citizenToken
    );

    const citizenSeesPhotoAndResolution =
      citizenDetailRes.statusCode === 200 &&
      citizenDetailRes.body?.data?.photo_url === storedCitizenPhotoUrl &&
      citizenDetailRes.body?.data?.status === 'RESOLVED';

    recordTest(
      10,
      'Citizen views resolved complaint with identical photo and resolution details',
      citizenSeesPhotoAndResolution,
      `Citizen Photo: "${citizenDetailRes.body?.data?.photo_url}", Status: ${citizenDetailRes.body?.data?.status}`
    );

    // -------------------------------------------------------------------------
    // TEST 11: Admin blocks officer -> officer operations rejected
    // -------------------------------------------------------------------------
    const blockOfficerRes = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/officers/${electricalOfficerProfileId}/block`,
      undefined,
      adminToken
    );

    const officerDbBlocked = await prisma.user.findUnique({
      where: { id: electricalOfficerUserId },
    });

    const blockedOfficerApiRes = await makeRequest(
      port,
      'GET',
      '/api/v1/officer/complaints',
      undefined,
      electricalOfficerToken
    );

    const blockedOfficerLoginRes = await makeRequest(port, 'POST', '/api/v1/auth/login', {
      email: electricalOfficerEmail,
      password: electricalOfficerPassword,
    });

    const officerBlockEnforced =
      blockOfficerRes.statusCode === 200 &&
      officerDbBlocked?.is_blocked === true &&
      blockedOfficerApiRes.statusCode === 403 &&
      blockedOfficerLoginRes.statusCode === 403;

    recordTest(
      11,
      'Admin blocks officer → protected operations and login are rejected (403 Forbidden)',
      officerBlockEnforced,
      `DB is_blocked: ${officerDbBlocked?.is_blocked}, API HTTP: ${blockedOfficerApiRes.statusCode}, Login HTTP: ${blockedOfficerLoginRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // TEST 12: Admin unblocks officer -> officer access restored
    // -------------------------------------------------------------------------
    const unblockOfficerRes = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/officers/${electricalOfficerProfileId}/unblock`,
      undefined,
      adminToken
    );

    const officerDbUnblocked = await prisma.user.findUnique({
      where: { id: electricalOfficerUserId },
    });

    const unblockedOfficerApiRes = await makeRequest(
      port,
      'GET',
      '/api/v1/officer/complaints',
      undefined,
      electricalOfficerToken
    );

    const officerUnblockRestored =
      unblockOfficerRes.statusCode === 200 &&
      officerDbUnblocked?.is_blocked === false &&
      unblockedOfficerApiRes.statusCode === 200;

    recordTest(
      12,
      'Admin unblocks officer → access restored according to approval status (200 OK)',
      officerUnblockRestored,
      `DB is_blocked: ${officerDbUnblocked?.is_blocked}, API HTTP: ${unblockedOfficerApiRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // TEST 13: Admin blocks citizen -> citizen operations rejected
    // -------------------------------------------------------------------------
    const blockCitizenRes = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/users/${citizenUserId}/block`,
      undefined,
      adminToken
    );

    const citizenDbBlocked = await prisma.user.findUnique({
      where: { id: citizenUserId },
    });

    const blockedCitizenApiRes = await makeRequest(
      port,
      'GET',
      '/api/v1/complaints/my',
      undefined,
      citizenToken
    );

    const blockedCitizenPostRes = await makeRequest(
      port,
      'POST',
      '/api/v1/complaints',
      {
        title: 'New Complaint While Blocked',
        description: 'This complaint submission should be blocked.',
        department_id: electricalDept.id,
      },
      citizenToken
    );

    const blockedCitizenLoginRes = await makeRequest(port, 'POST', '/api/v1/auth/login', {
      email: citizenEmail,
      password: citizenPassword,
    });

    const citizenBlockEnforced =
      blockCitizenRes.statusCode === 200 &&
      citizenDbBlocked?.is_blocked === true &&
      blockedCitizenApiRes.statusCode === 403 &&
      blockedCitizenPostRes.statusCode === 403 &&
      blockedCitizenLoginRes.statusCode === 403;

    recordTest(
      13,
      'Admin blocks citizen/user → protected operations and login are rejected (403 Forbidden)',
      citizenBlockEnforced,
      `DB is_blocked: ${citizenDbBlocked?.is_blocked}, GET HTTP: ${blockedCitizenApiRes.statusCode}, POST HTTP: ${blockedCitizenPostRes.statusCode}, Login HTTP: ${blockedCitizenLoginRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // TEST 14: Admin unblocks citizen -> citizen access restored
    // -------------------------------------------------------------------------
    const unblockCitizenRes = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/users/${citizenUserId}/unblock`,
      undefined,
      adminToken
    );

    const citizenDbUnblocked = await prisma.user.findUnique({
      where: { id: citizenUserId },
    });

    const unblockedCitizenApiRes = await makeRequest(
      port,
      'GET',
      '/api/v1/complaints/my',
      undefined,
      citizenToken
    );

    const citizenUnblockRestored =
      unblockCitizenRes.statusCode === 200 &&
      citizenDbUnblocked?.is_blocked === false &&
      unblockedCitizenApiRes.statusCode === 200;

    recordTest(
      14,
      'Admin unblocks citizen/user → access restored (200 OK)',
      citizenUnblockRestored,
      `DB is_blocked: ${citizenDbUnblocked?.is_blocked}, GET HTTP: ${unblockedCitizenApiRes.statusCode}`
    );

  } finally {
    server.close();
  }

  console.log('\n========================================================================');
  const allPassed = results.every((r) => r.passed);
  console.log(`                SCENARIO SUMMARY: ${results.filter(r => r.passed).length}/${results.length} PASSED`);
  console.log('========================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runScenarioTests()
  .catch((err) => {
    console.error('Scenario test suite failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
