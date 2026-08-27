import http from 'http';
import { AddressInfo } from 'net';
import { prisma } from './src/config/database.js';
import { createApp } from './src/app.js';
import { Role, VerificationStatus } from '@prisma/client';

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
  console.log(`  ${icon} [Test ${id}] ${title}${details ? ` → ${details}` : ''}`);
}

async function runOfficerRegistrationSuite() {
  console.log('\n========================================================================');
  console.log('      CivicSense — Real Officer Registration Flow Test Suite           ');
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

  // Setup Admin
  const adminEmail = `admin_reg_${timestamp}@civicsense.test`;
  const adminPassword = 'AdminPassword123!';
  const adminRegisterRes = await makeRequest(port, 'POST', '/api/v1/auth/register', {
    name: 'Admin Supervisor',
    email: adminEmail,
    password: adminPassword,
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

  // Setup Citizen
  const citizenEmail = `citizen_reg_${timestamp}@civicsense.test`;
  const citizenPassword = 'CitizenPassword123!';
  const citizenRegisterRes = await makeRequest(port, 'POST', '/api/v1/auth/register', {
    name: 'Citizen Vikram',
    email: citizenEmail,
    password: citizenPassword,
  });
  const citizenToken = citizenRegisterRes.body?.data?.token;

  let officerProfileId = '';
  let officerUserId = '';
  const officerEmail = `officer_reg_${timestamp}@civicsense.test`;
  const officerPassword = 'OfficerSecure123!';

  try {
    // -------------------------------------------------------------------------
    // 1. Officer registration without phone number
    // -------------------------------------------------------------------------
    const regRes = await makeRequest(port, 'POST', '/api/v1/auth/register/officer', {
      name: 'Officer Priya Sharma',
      email: officerEmail,
      password: officerPassword,
      department_id: testSanitationDept.id,
      designation: 'Senior Sanitation Inspector',
    });

    officerUserId = regRes.body?.data?.user?.id;
    officerProfileId = regRes.body?.data?.user?.officer_profile?.id;

    const officerInDb = await prisma.officerProfile.findUnique({
      where: { id: officerProfileId },
      include: { user: true },
    });

    recordTest(
      1,
      'Officer registration succeeds without phone number and sets status to PENDING',
      regRes.statusCode === 201 &&
        officerInDb?.verification_status === VerificationStatus.PENDING &&
        officerInDb?.user?.role === Role.OFFICER &&
        !regRes.body?.data?.token,
      `HTTP 201, DB Status: ${officerInDb?.verification_status}, Token issued: ${!!regRes.body?.data?.token}`
    );

    // -------------------------------------------------------------------------
    // 2. Duplicate email registration fails
    // -------------------------------------------------------------------------
    const duplicateRegRes = await makeRequest(port, 'POST', '/api/v1/auth/register/officer', {
      name: 'Duplicate Officer',
      email: officerEmail,
      password: officerPassword,
      department_id: testSanitationDept.id,
      designation: 'Assistant Inspector',
    });

    recordTest(
      2,
      'Duplicate email registration is rejected (409 Conflict)',
      duplicateRegRes.statusCode === 409,
      `HTTP status: ${duplicateRegRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // 3. Password complexity validation
    // -------------------------------------------------------------------------
    const weakPasswordRes = await makeRequest(port, 'POST', '/api/v1/auth/register/officer', {
      name: 'Weak Password Officer',
      email: `weak_${timestamp}@civicsense.test`,
      password: 'weakpassword', // missing uppercase and digit
      department_id: testSanitationDept.id,
      designation: 'Junior Engineer',
    });

    recordTest(
      3,
      'Weak password fails validation (400 / 422 Unprocessable Entity)',
      [400, 422].includes(weakPasswordRes.statusCode),
      `HTTP status: ${weakPasswordRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // 4. Missing required fields validation
    // -------------------------------------------------------------------------
    const missingFieldsRes = await makeRequest(port, 'POST', '/api/v1/auth/register/officer', {
      name: 'Incomplete Officer',
      email: `incomplete_${timestamp}@civicsense.test`,
      password: officerPassword,
      // missing department_id and designation
    });

    recordTest(
      4,
      'Missing required fields fails validation (400 / 422 Unprocessable Entity)',
      [400, 422].includes(missingFieldsRes.statusCode),
      `HTTP status: ${missingFieldsRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // 5. Pending officer login is rejected
    // -------------------------------------------------------------------------
    const pendingLoginRes = await makeRequest(port, 'POST', '/api/v1/auth/login', {
      email: officerEmail,
      password: officerPassword,
    });

    recordTest(
      5,
      'Pending officer login is rejected (403 Forbidden)',
      pendingLoginRes.statusCode === 403,
      `HTTP status: ${pendingLoginRes.statusCode}, Error: "${pendingLoginRes.body?.message || pendingLoginRes.body?.error}"`
    );

    // -------------------------------------------------------------------------
    // 6. Admin sees pending officer in roster
    // -------------------------------------------------------------------------
    const adminOfficersPendingRes = await makeRequest(
      port,
      'GET',
      '/api/v1/admin/officers?verification_status=PENDING',
      undefined,
      adminToken
    );
    const pendingList = adminOfficersPendingRes.body?.data?.officers || [];
    const foundInPending = pendingList.some((o: any) => o.id === officerProfileId);

    recordTest(
      6,
      'Admin sees pending officer in officer roster',
      adminOfficersPendingRes.statusCode === 200 && foundInPending,
      `Found pending officer: ${foundInPending}`
    );

    // -------------------------------------------------------------------------
    // 7. Citizen cannot approve officer
    // -------------------------------------------------------------------------
    const citizenApproveRes = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/officers/${officerProfileId}/approve`,
      undefined,
      citizenToken
    );

    recordTest(
      7,
      'Citizen cannot approve officer (403 Forbidden)',
      citizenApproveRes.statusCode === 403,
      `HTTP status: ${citizenApproveRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // 8. Admin approves officer
    // -------------------------------------------------------------------------
    const approveRes = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/officers/${officerProfileId}/approve`,
      undefined,
      adminToken
    );

    const officerInDbAfterApproval = await prisma.officerProfile.findUnique({
      where: { id: officerProfileId },
    });

    recordTest(
      8,
      'Admin approves officer in PostgreSQL',
      approveRes.statusCode === 200 &&
        officerInDbAfterApproval?.verification_status === VerificationStatus.APPROVED,
      `HTTP 200, DB Status: ${officerInDbAfterApproval?.verification_status}`
    );

    // -------------------------------------------------------------------------
    // 9. Duplicate approval rejected
    // -------------------------------------------------------------------------
    const duplicateApproveRes = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/officers/${officerProfileId}/approve`,
      undefined,
      adminToken
    );

    recordTest(
      9,
      'Duplicate approval is rejected (400 Bad Request)',
      duplicateApproveRes.statusCode === 400,
      `HTTP status: ${duplicateApproveRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // 10. Approved officer logs in successfully
    // -------------------------------------------------------------------------
    const approvedLoginRes = await makeRequest(port, 'POST', '/api/v1/auth/login', {
      email: officerEmail,
      password: officerPassword,
    });
    const officerToken = approvedLoginRes.body?.data?.token;

    recordTest(
      10,
      'Approved officer logs in successfully and receives JWT token',
      approvedLoginRes.statusCode === 200 && typeof officerToken === 'string' && officerToken.length > 0,
      `HTTP 200, Token issued: ${!!officerToken}`
    );

    // -------------------------------------------------------------------------
    // 11. Approved officer accesses Officer Portal endpoints
    // -------------------------------------------------------------------------
    const officerComplaintsRes = await makeRequest(
      port,
      'GET',
      '/api/v1/officer/complaints',
      undefined,
      officerToken
    );

    recordTest(
      11,
      'Approved officer accesses Officer Complaints Dashboard',
      officerComplaintsRes.statusCode === 200,
      `HTTP status: ${officerComplaintsRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // 12. Officer cannot approve other officers
    // -------------------------------------------------------------------------
    const officerApproveRes = await makeRequest(
      port,
      'PATCH',
      `/api/v1/admin/officers/${officerProfileId}/approve`,
      undefined,
      officerToken
    );

    recordTest(
      12,
      'Officer cannot access admin approval endpoints (403 Forbidden)',
      officerApproveRes.statusCode === 403,
      `HTTP status: ${officerApproveRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // 13. Route alias POST /api/v1/auth/officer/register works identically
    // -------------------------------------------------------------------------
    const aliasRegRes = await makeRequest(port, 'POST', '/api/v1/auth/officer/register', {
      name: 'Officer Alias Test',
      email: `alias_${timestamp}@civicsense.test`,
      password: officerPassword,
      department_id: testSanitationDept.id,
      designation: 'Assistant Ward Inspector',
    });

    recordTest(
      13,
      'Route alias POST /api/v1/auth/officer/register functions identically',
      aliasRegRes.statusCode === 201 && aliasRegRes.body?.data?.user?.officer_profile?.verification_status === 'PENDING',
      `HTTP status: ${aliasRegRes.statusCode}, Status: ${aliasRegRes.body?.data?.user?.officer_profile?.verification_status}`
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

runOfficerRegistrationSuite().catch((err) => {
  console.error('Officer registration test suite execution failed:', err);
  process.exit(1);
});
