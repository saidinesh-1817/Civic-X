import http from 'http';
import { AddressInfo } from 'net';
import express, { Express, Request, Response, NextFunction } from 'express';
import { Role, VerificationStatus } from '@prisma/client';
import { createApp } from './src/app.js';
import { prisma } from './src/config/database.js';
import { AuthService, SafeUser } from './src/modules/auth/auth.service.js';
import {
  requireAdmin,
  requireApprovedOfficer,
  requireAuthentication,
  requireCitizen,
  requireDepartmentAccess,
  requireOfficer,
  requireResourceOwner,
  requireRoles,
} from './src/middlewares/auth.middleware.js';
import {
  checkDepartmentAccess,
  checkResourceOwner,
  getAuthenticatedUser,
  assertDepartmentAccess,
  assertResourceOwner,
} from './src/utils/authHelpers.js';
import { ForbiddenError, UnauthorizedError } from './src/utils/apiError.js';
import { errorHandler } from './src/middlewares/error.middleware.js';

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

async function runAuthorizationTests() {
  console.log('\n===============================================================');
  console.log('  CivicSense B4: Authorization & Department Access Control     ');
  console.log('===============================================================\n');

  // ---------------------------------------------------------------------------
  // 1. Helper & Access Control Unit Tests
  // ---------------------------------------------------------------------------
  console.log('🛡️ Suite 1: Authorization Helper & Access Logic Tests');

  const deptMunicipality = '11111111-0000-0000-0000-000000000001';
  const deptRoads = '22222222-0000-0000-0000-000000000002';
  const deptElectricity = '33333333-0000-0000-0000-000000000003';

  const mockCitizenUser: SafeUser = {
    id: 'c1111111-1111-1111-1111-111111111111',
    name: 'Citizen A',
    email: 'citizena@civicsense.local',
    phone: '+91-9000000001',
    role: Role.CITIZEN,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockApprovedOfficerMunicipality: SafeUser = {
    id: 'o1111111-1111-1111-1111-111111111111',
    name: 'Officer Municipality',
    email: 'officer.muni@civicsense.local',
    phone: '+91-9000000002',
    role: Role.OFFICER,
    created_at: new Date(),
    updated_at: new Date(),
    officer_profile: {
      id: 'op111111-1111-1111-1111-111111111111',
      department_id: deptMunicipality,
      designation: 'Sanitation Inspector',
      verification_status: VerificationStatus.APPROVED,
      created_at: new Date(),
      updated_at: new Date(),
    },
  };

  const mockPendingOfficer: SafeUser = {
    id: 'o2222222-2222-2222-2222-222222222222',
    name: 'Officer Pending',
    email: 'officer.pending@civicsense.local',
    phone: '+91-9000000003',
    role: Role.OFFICER,
    created_at: new Date(),
    updated_at: new Date(),
    officer_profile: {
      id: 'op222222-2222-2222-2222-222222222222',
      department_id: deptRoads,
      designation: 'Road Engineer',
      verification_status: VerificationStatus.PENDING,
      created_at: new Date(),
      updated_at: new Date(),
    },
  };

  const mockRejectedOfficer: SafeUser = {
    id: 'o3333333-3333-3333-3333-333333333333',
    name: 'Officer Rejected',
    email: 'officer.rejected@civicsense.local',
    phone: '+91-9000000004',
    role: Role.OFFICER,
    created_at: new Date(),
    updated_at: new Date(),
    officer_profile: {
      id: 'op333333-3333-3333-3333-333333333333',
      department_id: deptElectricity,
      designation: 'Line Supervisor',
      verification_status: VerificationStatus.REJECTED,
      created_at: new Date(),
      updated_at: new Date(),
    },
  };

  const mockAdminUser: SafeUser = {
    id: 'a1111111-1111-1111-1111-111111111111',
    name: 'Platform Admin',
    email: 'admin@civicsense.local',
    phone: '+91-9000000005',
    role: Role.ADMIN,
    created_at: new Date(),
    updated_at: new Date(),
  };

  // Unit Test 1: getAuthenticatedUser assert presence
  const mockReqWithUser = { user: mockCitizenUser } as Request;
  const mockReqWithoutUser = {} as Request;
  let getAuthUserSuccess = false;
  try {
    const user = getAuthenticatedUser(mockReqWithUser);
    getAuthUserSuccess = user.id === mockCitizenUser.id;
  } catch {}

  let getAuthUserThrows401 = false;
  try {
    getAuthenticatedUser(mockReqWithoutUser);
  } catch (err: any) {
    getAuthUserThrows401 = err instanceof UnauthorizedError && err.statusCode === 401;
  }
  recordTest('U1', 'getAuthenticatedUser retrieves user or throws 401 Unauthorized', getAuthUserSuccess && getAuthUserThrows401);

  // Unit Test 2: Department Access Logic
  const muniOfficerCanAccessMuni = checkDepartmentAccess(mockApprovedOfficerMunicipality, deptMunicipality);
  const muniOfficerCannotAccessRoads = !checkDepartmentAccess(mockApprovedOfficerMunicipality, deptRoads);
  const muniOfficerCannotAccessElec = !checkDepartmentAccess(mockApprovedOfficerMunicipality, deptElectricity);
  const adminCanAccessAnyDept = checkDepartmentAccess(mockAdminUser, deptRoads) && checkDepartmentAccess(mockAdminUser, deptElectricity);
  const citizenCannotAccessDept = !checkDepartmentAccess(mockCitizenUser, deptMunicipality);
  const pendingOfficerCannotAccessDept = !checkDepartmentAccess(mockPendingOfficer, deptRoads);
  const rejectedOfficerCannotAccessDept = !checkDepartmentAccess(mockRejectedOfficer, deptElectricity);

  recordTest(
    'U2',
    'checkDepartmentAccess verifies isolation, officer boundaries, and admin override',
    muniOfficerCanAccessMuni &&
      muniOfficerCannotAccessRoads &&
      muniOfficerCannotAccessElec &&
      adminCanAccessAnyDept &&
      citizenCannotAccessDept &&
      pendingOfficerCannotAccessDept &&
      rejectedOfficerCannotAccessDept
  );

  // Unit Test 3: Citizen Resource Ownership Logic
  const citizenCanAccessOwnResource = checkResourceOwner(mockCitizenUser, mockCitizenUser.id);
  const citizenCannotAccessOtherResource = !checkResourceOwner(mockCitizenUser, 'other-user-uuid');
  const adminCanAccessAnyResource = checkResourceOwner(mockAdminUser, mockCitizenUser.id);
  recordTest(
    'U3',
    'checkResourceOwner enforces single-citizen resource isolation and admin override',
    citizenCanAccessOwnResource && citizenCannotAccessOtherResource && adminCanAccessAnyResource
  );

  // ---------------------------------------------------------------------------
  // 2. HTTP Integration Test Server Setup (Testing Endpoints A through K)
  // ---------------------------------------------------------------------------
  console.log('\n🌐 Suite 2: HTTP Integration Tests (Requirements A through K)\n');

  // Build a test Express app equipped with auth middlewares and test endpoints
  const testApp: Express = express();
  testApp.use(express.json());

  // Token-based simulated or live authenticator
  const userDatabase: Record<string, SafeUser> = {
    'token-citizen': mockCitizenUser,
    'token-officer-approved': mockApprovedOfficerMunicipality,
    'token-officer-pending': mockPendingOfficer,
    'token-officer-rejected': mockRejectedOfficer,
    'token-admin': mockAdminUser,
  };

  // JWT or Bearer Authenticator middleware for test server
  const testAuthenticator = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('Authentication token is missing or invalid');
      }

      const token = authHeader.substring(7).trim();
      if (!token) {
        throw new UnauthorizedError('Authentication token is missing');
      }

      // Check if it's one of our test tokens
      if (userDatabase[token]) {
        const u = userDatabase[token];
        // Enforce verification status check at authentication step
        if (u.role === Role.OFFICER && u.officer_profile?.verification_status !== VerificationStatus.APPROVED) {
          throw new ForbiddenError(
            `Officer account is currently ${u.officer_profile?.verification_status}. Access to protected resources is restricted.`
          );
        }
        req.user = u;
        return next();
      }

      // Or verify as a real signed JWT
      try {
        const decoded = AuthService.verifyToken(token);
        // If DB is connected, fetch from DB
        const dbUser = await prisma.user.findUnique({
          where: { id: decoded.userId },
          include: { officer_profile: { include: { department: true } } },
        });
        if (!dbUser) {
          throw new UnauthorizedError('User not found');
        }
        if (dbUser.role === Role.OFFICER && dbUser.officer_profile?.verification_status !== VerificationStatus.APPROVED) {
          throw new ForbiddenError('Officer account is not approved');
        }
        req.user = AuthService.sanitizeUser(dbUser);
        return next();
      } catch (jwtErr: any) {
        if (jwtErr instanceof ForbiddenError || jwtErr instanceof UnauthorizedError) {
          throw jwtErr;
        }
        throw new UnauthorizedError('Invalid authentication token');
      }
    } catch (err) {
      next(err);
    }
  };

  // Mount test endpoints
  testApp.get('/api/v1/test/protected', testAuthenticator, requireAuthentication, (_req, res) => {
    res.status(200).json({ success: true, message: 'Protected resource granted' });
  });

  testApp.get('/api/v1/test/citizen', testAuthenticator, requireCitizen, (req, res) => {
    res.status(200).json({ success: true, message: 'Citizen resource granted', user: req.user });
  });

  testApp.get('/api/v1/test/officer', testAuthenticator, requireOfficer, (req, res) => {
    res.status(200).json({ success: true, message: 'Officer resource granted', user: req.user });
  });

  testApp.get('/api/v1/test/admin', testAuthenticator, requireAdmin, (req, res) => {
    res.status(200).json({ success: true, message: 'Admin resource granted', user: req.user });
  });

  testApp.get(
    '/api/v1/test/department/:departmentId',
    testAuthenticator,
    requireDepartmentAccess((req) => req.params.departmentId),
    (req, res) => {
      res.status(200).json({
        success: true,
        message: 'Department resource granted',
        targetDepartmentId: req.params.departmentId,
        userDepartmentId: req.user?.officer_profile?.department_id,
      });
    }
  );

  testApp.post(
    '/api/v1/test/department-body',
    testAuthenticator,
    requireDepartmentAccess((req) => req.body?.target_department_id),
    (req, res) => {
      res.status(200).json({
        success: true,
        message: 'Department body resource granted',
        targetDepartmentId: req.body?.target_department_id,
        userDepartmentId: req.user?.officer_profile?.department_id,
      });
    }
  );

  testApp.get(
    '/api/v1/test/owner/:userId',
    testAuthenticator,
    requireResourceOwner((req) => req.params.userId),
    (req, res) => {
      res.status(200).json({
        success: true,
        message: 'Owner resource granted',
        resourceOwnerId: req.params.userId,
      });
    }
  );

  testApp.use(errorHandler);

  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  try {
    // -------------------------------------------------------------------------
    // Test A: Unauthenticated user -> protected endpoint (Expected: 401)
    // -------------------------------------------------------------------------
    const resA = await makeRequest(port, 'GET', '/api/v1/test/protected');
    recordTest(
      'A',
      'Unauthenticated user → protected endpoint',
      resA.statusCode === 401 && resA.body?.success === false,
      `Received ${resA.statusCode}`
    );

    // -------------------------------------------------------------------------
    // Test B: Citizen -> citizen endpoint (Expected: allowed / 200)
    // -------------------------------------------------------------------------
    const resB = await makeRequest(port, 'GET', '/api/v1/test/citizen', undefined, 'token-citizen');
    recordTest(
      'B',
      'Citizen → citizen endpoint',
      resB.statusCode === 200 && resB.body?.success === true,
      `Received ${resB.statusCode}`
    );

    // -------------------------------------------------------------------------
    // Test C: Citizen -> officer endpoint (Expected: 403 Forbidden)
    // -------------------------------------------------------------------------
    const resC = await makeRequest(port, 'GET', '/api/v1/test/officer', undefined, 'token-citizen');
    recordTest(
      'C',
      'Citizen → officer endpoint',
      resC.statusCode === 403 && resC.body?.success === false,
      `Received ${resC.statusCode}`
    );

    // -------------------------------------------------------------------------
    // Test D: Citizen -> admin endpoint (Expected: 403 Forbidden)
    // -------------------------------------------------------------------------
    const resD = await makeRequest(port, 'GET', '/api/v1/test/admin', undefined, 'token-citizen');
    recordTest(
      'D',
      'Citizen → admin endpoint',
      resD.statusCode === 403 && resD.body?.success === false,
      `Received ${resD.statusCode}`
    );

    // -------------------------------------------------------------------------
    // Test E: Approved officer -> officer endpoint (Expected: allowed / 200)
    // -------------------------------------------------------------------------
    const resE = await makeRequest(port, 'GET', '/api/v1/test/officer', undefined, 'token-officer-approved');
    recordTest(
      'E',
      'Approved officer → officer endpoint',
      resE.statusCode === 200 && resE.body?.success === true,
      `Received ${resE.statusCode}`
    );

    // -------------------------------------------------------------------------
    // Test F: Pending officer -> officer endpoint (Expected: 403 Forbidden)
    // -------------------------------------------------------------------------
    const resF = await makeRequest(port, 'GET', '/api/v1/test/officer', undefined, 'token-officer-pending');
    recordTest(
      'F',
      'Pending officer → officer endpoint',
      resF.statusCode === 403 && resF.body?.success === false,
      `Received ${resF.statusCode}`
    );

    // -------------------------------------------------------------------------
    // Test G: Rejected officer -> officer endpoint (Expected: 403 Forbidden)
    // -------------------------------------------------------------------------
    const resG = await makeRequest(port, 'GET', '/api/v1/test/officer', undefined, 'token-officer-rejected');
    recordTest(
      'G',
      'Rejected officer → officer endpoint',
      resG.statusCode === 403 && resG.body?.success === false,
      `Received ${resG.statusCode}`
    );

    // -------------------------------------------------------------------------
    // Test H: Officer -> admin endpoint (Expected: 403 Forbidden)
    // -------------------------------------------------------------------------
    const resH = await makeRequest(port, 'GET', '/api/v1/test/admin', undefined, 'token-officer-approved');
    recordTest(
      'H',
      'Officer → admin endpoint',
      resH.statusCode === 403 && resH.body?.success === false,
      `Received ${resH.statusCode}`
    );

    // -------------------------------------------------------------------------
    // Test I: Admin -> admin endpoint (Expected: allowed / 200)
    // -------------------------------------------------------------------------
    const resI = await makeRequest(port, 'GET', '/api/v1/test/admin', undefined, 'token-admin');
    recordTest(
      'I',
      'Admin → admin endpoint',
      resI.statusCode === 200 && resI.body?.success === true,
      `Received ${resI.statusCode}`
    );

    // -------------------------------------------------------------------------
    // Test J: Officer from Department A -> protected Department B resource (Expected: 403)
    // -------------------------------------------------------------------------
    // Approved officer is from Municipality (deptMunicipality)
    // Accessing Municipality resource (Dept A -> Dept A) -> 200
    const resJAllowed = await makeRequest(
      port,
      'GET',
      `/api/v1/test/department/${deptMunicipality}`,
      undefined,
      'token-officer-approved'
    );
    // Accessing Roads resource (Dept A -> Dept B) -> 403
    const resJDenied = await makeRequest(
      port,
      'GET',
      `/api/v1/test/department/${deptRoads}`,
      undefined,
      'token-officer-approved'
    );
    recordTest(
      'J',
      'Officer from Dept A → protected Dept B resource',
      resJAllowed.statusCode === 200 && resJDenied.statusCode === 403,
      `Dept A -> 200, Dept B -> 403`
    );

    // -------------------------------------------------------------------------
    // Test K: Officer attempts to manipulate department_id in the request
    // Expected: authorization strictly uses officer's actual department from DB/session
    // -------------------------------------------------------------------------
    // Municipality Officer passes spoofed { target_department_id: deptRoads } in request body
    // Middleware verifies target against officer's server-side department (Municipality) -> Rejected (403)
    const resKSpoofedDept = await makeRequest(
      port,
      'POST',
      '/api/v1/test/department-body',
      { target_department_id: deptRoads, spoofed_role: 'ADMIN', spoofed_officer_id: 'any' },
      'token-officer-approved'
    );
    // When requesting their actual department with matching body -> Allowed (200)
    const resKLegitDept = await makeRequest(
      port,
      'POST',
      '/api/v1/test/department-body',
      { target_department_id: deptMunicipality },
      'token-officer-approved'
    );
    recordTest(
      'K',
      'Officer attempts to manipulate department_id in request',
      resKSpoofedDept.statusCode === 403 && resKLegitDept.statusCode === 200,
      `Spoofed request blocked with 403 Forbidden; legitimate allowed with 200`
    );

    // -------------------------------------------------------------------------
    // Additional Test L: Citizen Resource Ownership
    // -------------------------------------------------------------------------
    // Citizen A accessing Citizen A's resource -> 200
    const resLOwnResource = await makeRequest(
      port,
      'GET',
      `/api/v1/test/owner/${mockCitizenUser.id}`,
      undefined,
      'token-citizen'
    );
    // Citizen A accessing Citizen B's resource -> 403
    const resLOtherResource = await makeRequest(
      port,
      'GET',
      `/api/v1/test/owner/another-citizen-uuid`,
      undefined,
      'token-citizen'
    );
    // Admin accessing Citizen B's resource -> 200
    const resLAdminOverride = await makeRequest(
      port,
      'GET',
      `/api/v1/test/owner/another-citizen-uuid`,
      undefined,
      'token-admin'
    );
    recordTest(
      'L',
      'Citizen Resource Ownership & Privacy Isolation',
      resLOwnResource.statusCode === 200 &&
        resLOtherResource.statusCode === 403 &&
        resLAdminOverride.statusCode === 200,
      `Own resource -> 200, Other citizen's resource -> 403, Admin -> 200`
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

runAuthorizationTests()
  .catch((err) => {
    console.error('Fatal authorization test error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
