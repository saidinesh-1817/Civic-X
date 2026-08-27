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
            // Keep raw
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
  console.log(`  ${icon} [Test ${id}] ${title}${details ? ` → ${details}` : ''}`);
}

async function runVerificationSuite() {
  console.log('\n========================================================================');
  console.log('   CivicSense — 18 Final Pre-Deployment Backend Verification Points    ');
  console.log('========================================================================\n');

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  const timestamp = Date.now();
  const testSanitationDept = await prisma.department.findFirst({
    where: { name: { contains: 'Sanitation' } },
  });
  if (!testSanitationDept) {
    throw new Error('Sanitation department not found in DB seed');
  }

  // Setup Admin user
  const adminEmail = `admin_${timestamp}@civicsense.test`;
  const adminPassword = 'AdminPassword123!';
  const adminRegisterRes = await makeRequest(port, 'POST', '/api/v1/auth/register', {
    name: 'Deployment Admin',
    email: adminEmail,
    password: adminPassword,
    phone: '+91-9999900001',
  });
  const adminUserId = adminRegisterRes.body?.data?.user?.id;
  await prisma.user.update({
    where: { id: adminUserId },
    data: { role: Role.ADMIN },
  });

  const adminLoginRes = await makeRequest(port, 'POST', '/api/v1/auth/login', {
    email: adminEmail,
    password: adminPassword,
  });
  const adminToken = adminLoginRes.body?.data?.token;

  // Setup Citizen user
  const citizenEmail = `citizen_${timestamp}@civicsense.test`;
  const citizenPassword = 'CitizenPassword123!';
  const citizenRegisterRes = await makeRequest(port, 'POST', '/api/v1/auth/register', {
    name: 'Citizen Vikram',
    email: citizenEmail,
    password: citizenPassword,
    phone: '+91-9999900002',
  });
  const citizenToken = citizenRegisterRes.body?.data?.token;
  const citizenUserId = citizenRegisterRes.body?.data?.user?.id;

  let officerProfileId = '';
  let officerUserId = '';
  let officerToken = '';
  const officerEmail = `officer_${timestamp}@civicsense.test`;
  const officerPassword = 'OfficerPassword123!';

  try {
    // -------------------------------------------------------------------------
    // 1. Officer registration creates pending officer
    // -------------------------------------------------------------------------
    const officerRegRes = await makeRequest(port, 'POST', '/api/v1/auth/register/officer', {
      name: 'Officer Rajesh',
      email: officerEmail,
      password: officerPassword,
      phone: '+91-9999900003',
      department_id: testSanitationDept.id,
      designation: 'Sanitation Ward Officer',
    });
    officerUserId = officerRegRes.body?.data?.user?.id;
    officerProfileId = officerRegRes.body?.data?.user?.officer_profile?.id;

    const officerDb = await prisma.officerProfile.findUnique({
      where: { id: officerProfileId },
    });

    recordTest(
      1,
      'Officer registration creates pending officer',
      officerRegRes.statusCode === 201 && officerDb?.verification_status === VerificationStatus.PENDING,
      `Status in DB: ${officerDb?.verification_status}`
    );

    // -------------------------------------------------------------------------
    // 2. Admin sees pending officer
    // -------------------------------------------------------------------------
    const adminOfficersPendingRes = await makeRequest(
      port,
      'GET',
      '/api/v1/admin/officers?verification_status=PENDING',
      undefined,
      adminToken
    );
    const pendingOfficersList = adminOfficersPendingRes.body?.data?.officers || [];
    const foundPending = pendingOfficersList.some((o: any) => o.id === officerProfileId);

    recordTest(
      2,
      'Admin sees pending officer in list',
      adminOfficersPendingRes.statusCode === 200 && foundPending,
      `Found pending officer ID: ${officerProfileId}`
    );

    // -------------------------------------------------------------------------
    // 3. Admin approval persists
    // -------------------------------------------------------------------------
    const approveRes = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/officers/${officerProfileId}/approve`,
      undefined,
      adminToken
    );
    const officerDbAfterApproval = await prisma.officerProfile.findUnique({
      where: { id: officerProfileId },
    });

    recordTest(
      3,
      'Admin approval persists in PostgreSQL',
      approveRes.statusCode === 200 && officerDbAfterApproval?.verification_status === VerificationStatus.APPROVED,
      `Updated status: ${officerDbAfterApproval?.verification_status}`
    );

    // -------------------------------------------------------------------------
    // 4. Approved officer remains approved after refresh
    // -------------------------------------------------------------------------
    const refreshOfficerRes = await makeRequest(
      port,
      'GET',
      `/api/v1/admin/officers/${officerProfileId}`,
      undefined,
      adminToken
    );
    recordTest(
      4,
      'Approved officer remains approved after refresh',
      refreshOfficerRes.statusCode === 200 && refreshOfficerRes.body?.data?.verification_status === 'APPROVED',
      `Re-fetched verification status: ${refreshOfficerRes.body?.data?.verification_status}`
    );

    // Login as approved officer to obtain token
    const officerLoginRes = await makeRequest(port, 'POST', '/api/v1/auth/login', {
      email: officerEmail,
      password: officerPassword,
    });
    officerToken = officerLoginRes.body?.data?.token;

    // -------------------------------------------------------------------------
    // 5. Citizen cannot approve officer
    // -------------------------------------------------------------------------
    const citizenApproveRes = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/officers/${officerProfileId}/approve`,
      undefined,
      citizenToken
    );
    recordTest(
      5,
      'Citizen cannot approve officer (403 Forbidden)',
      citizenApproveRes.statusCode === 403,
      `HTTP status: ${citizenApproveRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // 6. Officer cannot approve officer
    // -------------------------------------------------------------------------
    const officerApproveRes = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/officers/${officerProfileId}/approve`,
      undefined,
      officerToken
    );
    recordTest(
      6,
      'Officer cannot approve officer (403 Forbidden)',
      officerApproveRes.statusCode === 403,
      `HTTP status: ${officerApproveRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // 7. Admin blocks citizen
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
    recordTest(
      7,
      'Admin blocks citizen',
      blockCitizenRes.statusCode === 200 && citizenDbBlocked?.is_blocked === true,
      `DB is_blocked = ${citizenDbBlocked?.is_blocked}`
    );

    // -------------------------------------------------------------------------
    // 8. Block persists after refresh
    // -------------------------------------------------------------------------
    const refreshCitizenRes = await makeRequest(
      port,
      'GET',
      `/api/v1/admin/users/${citizenUserId}`,
      undefined,
      adminToken
    );
    recordTest(
      8,
      'Block persists after refresh',
      refreshCitizenRes.statusCode === 200 && refreshCitizenRes.body?.data?.is_blocked === true,
      `Re-fetched is_blocked = ${refreshCitizenRes.body?.data?.is_blocked}`
    );

    // -------------------------------------------------------------------------
    // 9. Blocked citizen authentication/access is rejected according to existing auth rules
    // -------------------------------------------------------------------------
    const blockedCitizenAccessRes = await makeRequest(
      port,
      'GET',
      '/api/v1/complaints/my',
      undefined,
      citizenToken // Using previously issued JWT token
    );
    const blockedCitizenLoginRes = await makeRequest(port, 'POST', '/api/v1/auth/login', {
      email: citizenEmail,
      password: citizenPassword,
    });
    recordTest(
      9,
      'Blocked citizen authentication/access is rejected (403 Forbidden)',
      blockedCitizenAccessRes.statusCode === 403 && blockedCitizenLoginRes.statusCode === 403,
      `Token access HTTP ${blockedCitizenAccessRes.statusCode}, Login HTTP ${blockedCitizenLoginRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // 10. Admin unblocks citizen
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
    recordTest(
      10,
      'Admin unblocks citizen',
      unblockCitizenRes.statusCode === 200 && citizenDbUnblocked?.is_blocked === false,
      `DB is_blocked = ${citizenDbUnblocked?.is_blocked}`
    );

    // -------------------------------------------------------------------------
    // 11. Citizen becomes active again
    // -------------------------------------------------------------------------
    const citizenActiveAccessRes = await makeRequest(
      port,
      'GET',
      '/api/v1/complaints/my',
      undefined,
      citizenToken
    );
    recordTest(
      11,
      'Citizen becomes active again',
      citizenActiveAccessRes.statusCode === 200,
      `HTTP status: ${citizenActiveAccessRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // 12. Admin blocks officer
    // -------------------------------------------------------------------------
    const blockOfficerRes = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/officers/${officerProfileId}/block`,
      undefined,
      adminToken
    );
    const officerDbBlocked = await prisma.user.findUnique({
      where: { id: officerUserId },
    });
    recordTest(
      12,
      'Admin blocks officer',
      blockOfficerRes.statusCode === 200 && officerDbBlocked?.is_blocked === true,
      `DB is_blocked = ${officerDbBlocked?.is_blocked}`
    );

    // -------------------------------------------------------------------------
    // 13. Officer becomes blocked
    // -------------------------------------------------------------------------
    const blockedOfficerAccessRes = await makeRequest(
      port,
      'GET',
      '/api/v1/officer/complaints',
      undefined,
      officerToken
    );
    const blockedOfficerLoginRes = await makeRequest(port, 'POST', '/api/v1/auth/login', {
      email: officerEmail,
      password: officerPassword,
    });
    recordTest(
      13,
      'Officer becomes blocked (403 Forbidden)',
      blockedOfficerAccessRes.statusCode === 403 && blockedOfficerLoginRes.statusCode === 403,
      `Token access HTTP ${blockedOfficerAccessRes.statusCode}, Login HTTP ${blockedOfficerLoginRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // 14. Admin unblocks officer
    // -------------------------------------------------------------------------
    const unblockOfficerRes = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/officers/${officerProfileId}/unblock`,
      undefined,
      adminToken
    );
    const officerDbUnblocked = await prisma.user.findUnique({
      where: { id: officerUserId },
    });
    recordTest(
      14,
      'Admin unblocks officer',
      unblockOfficerRes.statusCode === 200 && officerDbUnblocked?.is_blocked === false,
      `DB is_blocked = ${officerDbUnblocked?.is_blocked}`
    );

    // -------------------------------------------------------------------------
    // 15. Officer becomes active again
    // -------------------------------------------------------------------------
    const officerActiveAccessRes = await makeRequest(
      port,
      'GET',
      '/api/v1/officer/complaints',
      undefined,
      officerToken
    );
    recordTest(
      15,
      'Officer becomes active again',
      officerActiveAccessRes.statusCode === 200,
      `HTTP status: ${officerActiveAccessRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // 16. Real complaint remains NEW until a real officer acts
    // -------------------------------------------------------------------------
    // 16a: Citizen files complaint
    const dummyBase64Photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const submitComplaintRes = await makeRequest(
      port,
      'POST',
      '/api/v1/complaints',
      {
        title: 'Clogged Drainage on Market Street',
        description: 'Water accumulation in front of shops due to clogged storm drain.',
        department_id: testSanitationDept.id,
        latitude: 12.9716,
        longitude: 77.5946,
        photo: dummyBase64Photo,
      },
      citizenToken
    );
    const complaintId = submitComplaintRes.body?.data?.id;

    // Check complaint is NEW and unassigned
    const complaintDbInitial = await prisma.complaint.findUnique({
      where: { id: complaintId },
      include: { assignments: true },
    });

    const isInitiallyNew =
      complaintDbInitial?.status === ComplaintStatus.NEW &&
      complaintDbInitial?.assignments.length === 0;

    // 16b: Real officer accepts complaint -> ASSIGNED
    const assignRes = await makeRequest(
      port,
      'POST',
      `/api/v1/officer/complaints/${complaintId}/assign`,
      { note: 'Officer Rajesh assigned to field inspection.' },
      officerToken
    );

    // 16c: Real officer starts work -> IN_PROGRESS
    const inProgressRes = await makeRequest(
      port,
      'PATCH',
      `/api/v1/officer/complaints/${complaintId}/status`,
      { status: 'IN_PROGRESS', note: 'Cleaning crew dispatched.' },
      officerToken
    );

    // 16d: Real officer resolves -> RESOLVED
    const resolveRes = await makeRequest(
      port,
      'POST',
      `/api/v1/officer/complaints/${complaintId}/resolve`,
      {
        note: 'Drain cleaned and water flow restored.',
        photo: dummyBase64Photo,
      },
      officerToken
    );

    recordTest(
      16,
      'Real complaint lifecycle strictly transitions NEW → ASSIGNED → IN_PROGRESS → RESOLVED',
      isInitiallyNew &&
        assignRes.statusCode === 200 &&
        inProgressRes.statusCode === 200 &&
        resolveRes.statusCode === 200 &&
        resolveRes.body?.data?.status === 'RESOLVED',
      `Initial: NEW (unassigned) → Accepted (ASSIGNED) → In Progress → Resolved`
    );

    // -------------------------------------------------------------------------
    // 17. Admin can retrieve real complaint state
    // -------------------------------------------------------------------------
    const adminComplaintsListRes = await makeRequest(
      port,
      'GET',
      `/api/v1/admin/complaints?search=${encodeURIComponent('Clogged Drainage')}`,
      undefined,
      adminToken
    );
    const adminComplaintDetailRes = await makeRequest(
      port,
      'GET',
      `/api/v1/complaints/${complaintId}`,
      undefined,
      adminToken
    );

    const foundInAdminList = adminComplaintsListRes.body?.data?.complaints?.some(
      (c: any) => c.id === complaintId && c.status === 'RESOLVED'
    );
    const adminDetailOk =
      adminComplaintDetailRes.statusCode === 200 &&
      adminComplaintDetailRes.body?.data?.status === 'RESOLVED' &&
      adminComplaintDetailRes.body?.data?.assigned_officer?.officer_name === 'Officer Rajesh' &&
      adminComplaintDetailRes.body?.data?.resolution?.note === 'Drain cleaned and water flow restored.';

    recordTest(
      17,
      'Admin can retrieve real complaint state and master complaint listing',
      adminComplaintsListRes.statusCode === 200 && foundInAdminList && adminDetailOk,
      `Master List status: 200, Assigned Officer: "${adminComplaintDetailRes.body?.data?.assigned_officer?.officer_name}"`
    );

    // -------------------------------------------------------------------------
    // 18. Complaint photo is returned when available
    // -------------------------------------------------------------------------
    // Submit second complaint without photo
    const noPhotoComplaintRes = await makeRequest(
      port,
      'POST',
      '/api/v1/complaints',
      {
        title: 'Streetlight out on 2nd cross',
        description: 'Light has been off since Monday.',
        department_id: testSanitationDept.id,
      },
      citizenToken
    );
    const noPhotoComplaintId = noPhotoComplaintRes.body?.data?.id;
    const noPhotoDetailRes = await makeRequest(
      port,
      'GET',
      `/api/v1/complaints/${noPhotoComplaintId}`,
      undefined,
      adminToken
    );

    const photoDetailRes = await makeRequest(
      port,
      'GET',
      `/api/v1/complaints/${complaintId}`,
      undefined,
      adminToken
    );

    const photoAvailable = typeof photoDetailRes.body?.data?.photo_url === 'string' && photoDetailRes.body?.data?.photo_url.length > 0;
    const photoNullWhenMissing = noPhotoDetailRes.body?.data?.photo_url === null;

    recordTest(
      18,
      'Complaint photo is returned when available and null when not provided',
      photoAvailable && photoNullWhenMissing,
      `With photo: "${photoDetailRes.body?.data?.photo_url}", Without photo: ${noPhotoDetailRes.body?.data?.photo_url}`
    );

  } finally {
    server.close();
  }

  console.log('\n========================================================================');
  const allPassed = results.every((r) => r.passed);
  console.log(`                VERIFICATION SUMMARY: ${results.filter(r => r.passed).length}/${results.length} PASSED`);
  console.log('========================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runVerificationSuite().catch((err) => {
  console.error('Test suite execution failed:', err);
  process.exit(1);
});
