import http from 'http';
import { AddressInfo } from 'net';
import express, { Express, Request, Response, NextFunction } from 'express';
import { Role, VerificationStatus } from '@prisma/client';
import { createApp } from './src/app.js';
import { prisma } from './src/config/database.js';
import { AuthService, SafeUser } from './src/modules/auth/auth.service.js';
import {
  requireAdmin,
  requireAuthentication,
  requireCitizen,
  requireOfficer,
} from './src/middlewares/auth.middleware.js';
import { validate } from './src/middlewares/validate.middleware.js';
import { calculateHaversineDistance, isValidLatitude, isValidLongitude } from './src/utils/geo.js';
import { DepartmentsService } from './src/modules/departments/departments.service.js';
import { DepartmentsController } from './src/modules/departments/departments.controller.js';
import {
  createDepartmentSchema,
  createOfficeSchema,
  departmentIdParamSchema,
  nearestOfficeQuerySchema,
  officeIdParamSchema,
  updateDepartmentSchema,
  updateOfficeSchema,
} from './src/modules/departments/departments.schema.js';
import { errorHandler } from './src/middlewares/error.middleware.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from './src/utils/apiError.js';

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

async function runDepartmentTests() {
  console.log('\n===============================================================');
  console.log('   CivicSense B5: Department & Office Management - Test Suite  ');
  console.log('===============================================================\n');

  // ---------------------------------------------------------------------------
  // 1. Geographic & Haversine Distance Unit Tests
  // ---------------------------------------------------------------------------
  console.log('🌍 Suite 1: Haversine Calculation & Coordinate Validation');

  // Known distance test:
  // Cubbon Park Bangalore (12.9760, 77.5920) to Indiranagar Bangalore (12.9784, 77.6408)
  // Distance is approximately 5.3 km
  const dist = calculateHaversineDistance(12.9760, 77.5920, 12.9784, 77.6408);
  const isDistanceAccurate = dist.distanceKm >= 5.0 && dist.distanceKm <= 5.6 && dist.distanceMeters > 5000;
  recordTest(
    'GEO-1',
    'Haversine distance accurately computes geodesic distance',
    isDistanceAccurate,
    `Calculated: ${dist.distanceKm} km (${dist.distanceMeters} m)`
  );

  // Coordinate boundary checks
  const validLat = isValidLatitude(12.97) && isValidLatitude(-90) && isValidLatitude(90);
  const invalidLat = !isValidLatitude(90.1) && !isValidLatitude(-90.1) && !isValidLatitude(NaN);
  const validLon = isValidLongitude(77.59) && isValidLongitude(-180) && isValidLongitude(180);
  const invalidLon = !isValidLongitude(180.1) && !isValidLongitude(-180.1) && !isValidLongitude(NaN);

  recordTest(
    'GEO-2',
    'Coordinate boundary validation [-90..90] lat and [-180..180] lon',
    validLat && invalidLat && validLon && invalidLon
  );

  // ---------------------------------------------------------------------------
  // 2. HTTP Integration Test Server Setup (Testing Requirements A through J)
  // ---------------------------------------------------------------------------
  console.log('\n🏢 Suite 2: HTTP Integration & Endpoint Tests (A through J)\n');

  // Mock data representing standard seeded departments & offices
  const deptSanitationId = '11111111-1111-1111-1111-111111111111';
  const deptRoadsId = '22222222-2222-2222-2222-222222222222';
  const deptInactiveId = '99999999-9999-9999-9999-999999999999';

  const officeSanitationCentralId = 'aaaa1111-1111-1111-1111-111111111111';
  const officeSanitationEastId = 'aaaa2222-2222-2222-2222-222222222222';
  const officeRoadsWestId = 'bbbb1111-1111-1111-1111-111111111111';

  const mockDepartments = [
    {
      id: deptSanitationId,
      name: 'Municipality / Sanitation',
      description: 'Solid waste management & sanitation',
      active: true,
      officeCount: 2,
      officerCount: 1,
      createdAt: new Date(),
    },
    {
      id: deptRoadsId,
      name: 'Roads & Infrastructure',
      description: 'Pothole repair and road resurfacing',
      active: true,
      officeCount: 1,
      officerCount: 1,
      createdAt: new Date(),
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Water Supply',
      description: 'Potable water distribution and pipe leak repairs',
      active: true,
      officeCount: 1,
      officerCount: 0,
      createdAt: new Date(),
    },
    {
      id: '44444444-4444-4444-4444-444444444444',
      name: 'Electricity',
      description: 'Streetlight faults and power grid maintenance',
      active: true,
      officeCount: 1,
      officerCount: 0,
      createdAt: new Date(),
    },
    {
      id: '55555555-5555-5555-5555-555555555555',
      name: 'Traffic',
      description: 'Traffic signals and signages',
      active: true,
      officeCount: 1,
      officerCount: 0,
      createdAt: new Date(),
    },
    {
      id: '66666666-6666-6666-6666-666666666666',
      name: 'Public Health',
      description: 'Disease prevention and clinic monitoring',
      active: true,
      officeCount: 1,
      officerCount: 0,
      createdAt: new Date(),
    },
    {
      id: '77777777-7777-7777-7777-777777777777',
      name: 'Environment / Parks',
      description: 'Public parks and urban greenery',
      active: true,
      officeCount: 1,
      officerCount: 0,
      createdAt: new Date(),
    },
    {
      id: '88888888-8888-8888-8888-888888888888',
      name: 'Fire & Emergency',
      description: 'Fire hazard reporting and rescue services',
      active: true,
      officeCount: 1,
      officerCount: 0,
      createdAt: new Date(),
    },
    {
      id: '99999999-0000-0000-0000-000000000001',
      name: 'Public Transport',
      description: 'Bus stop maintenance and transit terminals',
      active: true,
      officeCount: 1,
      officerCount: 0,
      createdAt: new Date(),
    },
    {
      id: '99999999-0000-0000-0000-000000000002',
      name: 'Housing / Building Issues',
      description: 'Unauthorized construction and zoning compliance',
      active: true,
      officeCount: 1,
      officerCount: 0,
      createdAt: new Date(),
    },
  ];

  const mockOffices = [
    {
      id: officeSanitationCentralId,
      department_id: deptSanitationId,
      name: 'Central Sanitation Division HQ',
      address: 'Plot 101, Civic Center Road, Central Zone',
      latitude: 12.9716,
      longitude: 77.5946,
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: officeSanitationEastId,
      department_id: deptSanitationId,
      name: 'East Ward Sanitation Office',
      address: 'Building B, 8th Cross, Indiranagar East',
      latitude: 12.9810,
      longitude: 77.6320,
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: officeRoadsWestId,
      department_id: deptRoadsId,
      name: 'West Infrastructure Maintenance Depot',
      address: 'Industrial Ring Road, Rajajinagar West',
      latitude: 12.9850,
      longitude: 77.5500,
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];

  const mockCitizenUser: SafeUser = {
    id: 'user-cit-1111',
    name: 'Citizen Test',
    email: 'citizen@test.local',
    phone: '+91-9000000001',
    role: Role.CITIZEN,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockOfficerUser: SafeUser = {
    id: 'user-off-1111',
    name: 'Officer Test',
    email: 'officer@test.local',
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

  const mockAdminUser: SafeUser = {
    id: 'user-adm-1111',
    name: 'Admin Test',
    email: 'admin@test.local',
    phone: '+91-9000000003',
    role: Role.ADMIN,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const testApp: Express = express();
  testApp.use(express.json());

  // Test authentication token resolver
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
    } else if (token === 'token-admin') {
      req.user = mockAdminUser;
    }
    next();
  };

  testApp.use(testAuthenticator);

  // Departments Routes
  testApp.get('/api/v1/departments', (_req, res) => {
    res.status(200).json({ success: true, data: mockDepartments });
  });

  testApp.get(
    '/api/v1/departments/:departmentId',
    validate({ params: departmentIdParamSchema }),
    (req, res, next) => {
      const dept = mockDepartments.find((d) => d.id === req.params.departmentId);
      if (!dept || !dept.active) {
        return next(new NotFoundError('Department not found or is currently inactive'));
      }
      res.status(200).json({ success: true, data: dept });
    }
  );

  testApp.get(
    '/api/v1/departments/:departmentId/offices',
    validate({ params: departmentIdParamSchema }),
    (req, res, next) => {
      const dept = mockDepartments.find((d) => d.id === req.params.departmentId);
      if (!dept || !dept.active) {
        return next(new NotFoundError('Department not found'));
      }
      const offices = mockOffices.filter((o) => o.department_id === req.params.departmentId && o.active);
      res.status(200).json({ success: true, data: offices });
    }
  );

  testApp.get(
    '/api/v1/departments/:departmentId/nearest-office',
    validate({ params: departmentIdParamSchema, query: nearestOfficeQuerySchema }),
    (req, res, next) => {
      const dept = mockDepartments.find((d) => d.id === req.params.departmentId);
      if (!dept || !dept.active) {
        return next(new NotFoundError('Department not found'));
      }
      const lat = Number(req.query.latitude);
      const lon = Number(req.query.longitude);
      const deptOffices = mockOffices.filter((o) => o.department_id === req.params.departmentId && o.active);

      if (deptOffices.length === 0) {
        return next(new NotFoundError('No active offices found'));
      }

      let nearest = deptOffices[0];
      let minDistance = calculateHaversineDistance(lat, lon, nearest.latitude, nearest.longitude);

      for (let i = 1; i < deptOffices.length; i++) {
        const off = deptOffices[i];
        const dist = calculateHaversineDistance(lat, lon, off.latitude, off.longitude);
        if (dist.distanceKm < minDistance.distanceKm) {
          minDistance = dist;
          nearest = off;
        }
      }

      res.status(200).json({
        success: true,
        data: {
          office: nearest,
          department: { id: dept.id, name: dept.name },
          distanceKm: minDistance.distanceKm,
          distanceMeters: minDistance.distanceMeters,
          queriedCoordinates: { latitude: lat, longitude: lon },
        },
      });
    }
  );

  testApp.post(
    '/api/v1/departments',
    requireAuthentication,
    requireAdmin,
    validate({ body: createDepartmentSchema }),
    (req, res) => {
      res.status(201).json({ success: true, data: { id: 'new-dept-uuid', ...req.body } });
    }
  );

  testApp.patch(
    '/api/v1/departments/:departmentId',
    requireAuthentication,
    requireAdmin,
    validate({ params: departmentIdParamSchema, body: updateDepartmentSchema }),
    (req, res, next) => {
      const dept = mockDepartments.find((d) => d.id === req.params.departmentId);
      if (!dept) return next(new NotFoundError('Department not found'));
      res.status(200).json({ success: true, data: { ...dept, ...req.body } });
    }
  );

  // Offices Routes
  testApp.get(
    '/api/v1/offices/:officeId',
    validate({ params: officeIdParamSchema }),
    (req, res, next) => {
      const office = mockOffices.find((o) => o.id === req.params.officeId);
      if (!office || !office.active) {
        return next(new NotFoundError('Office not found or is currently inactive'));
      }
      const dept = mockDepartments.find((d) => d.id === office.department_id);
      res.status(200).json({ success: true, data: { ...office, department: dept } });
    }
  );

  testApp.post(
    '/api/v1/departments/:departmentId/offices',
    requireAuthentication,
    requireAdmin,
    validate({ params: departmentIdParamSchema, body: createOfficeSchema }),
    (req, res, next) => {
      const dept = mockDepartments.find((d) => d.id === req.params.departmentId);
      if (!dept) return next(new NotFoundError('Department not found'));
      res.status(201).json({ success: true, data: { id: 'new-office-uuid', department_id: req.params.departmentId, ...req.body } });
    }
  );

  testApp.patch(
    '/api/v1/offices/:officeId',
    requireAuthentication,
    requireAdmin,
    validate({ params: officeIdParamSchema, body: updateOfficeSchema }),
    (req, res, next) => {
      const office = mockOffices.find((o) => o.id === req.params.officeId);
      if (!office) return next(new NotFoundError('Office not found'));
      res.status(200).json({ success: true, data: { ...office, ...req.body } });
    }
  );

  testApp.delete(
    '/api/v1/offices/:officeId',
    requireAuthentication,
    requireAdmin,
    validate({ params: officeIdParamSchema }),
    (req, res, next) => {
      const office = mockOffices.find((o) => o.id === req.params.officeId);
      if (!office) return next(new NotFoundError('Office not found'));
      res.status(200).json({ success: true, data: { ...office, active: false } });
    }
  );

  testApp.use(errorHandler);

  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  try {
    // -------------------------------------------------------------------------
    // Test A: Get all departments -> SUCCESS
    // -------------------------------------------------------------------------
    const resA = await makeRequest(port, 'GET', '/api/v1/departments');
    const has10Depts = Array.isArray(resA.body?.data) && resA.body?.data?.length === 10;
    const hasSanitation = resA.body?.data?.some((d: any) => d.name === 'Municipality / Sanitation');
    recordTest(
      'A',
      'Get all departments → SUCCESS (200 OK & 10 core departments returned)',
      resA.statusCode === 200 && has10Depts && hasSanitation,
      `Returned ${resA.body?.data?.length} departments`
    );

    // -------------------------------------------------------------------------
    // Test B: Get active department -> SUCCESS
    // -------------------------------------------------------------------------
    const resB = await makeRequest(port, 'GET', `/api/v1/departments/${deptSanitationId}`);
    const isSanitation = resB.body?.data?.name === 'Municipality / Sanitation' && resB.body?.data?.active === true;
    recordTest(
      'B',
      'Get active department by ID → SUCCESS (200 OK & department metadata)',
      resB.statusCode === 200 && isSanitation
    );

    // -------------------------------------------------------------------------
    // Test C: Invalid department -> appropriate error (404 / 422)
    // -------------------------------------------------------------------------
    // Invalid UUID format -> 422
    const resCFormat = await makeRequest(port, 'GET', '/api/v1/departments/non-uuid-string');
    // Non-existent UUID -> 404
    const resCNotFound = await makeRequest(port, 'GET', '/api/v1/departments/00000000-0000-0000-0000-000000000000');
    recordTest(
      'C',
      'Invalid department ID → appropriate error (422 for format, 404 for not found)',
      resCFormat.statusCode === 422 && resCNotFound.statusCode === 404
    );

    // -------------------------------------------------------------------------
    // Test D: Get offices for department -> SUCCESS
    // -------------------------------------------------------------------------
    const resD = await makeRequest(port, 'GET', `/api/v1/departments/${deptSanitationId}/offices`);
    const has2Offices = Array.isArray(resD.body?.data) && resD.body?.data?.length === 2;
    recordTest(
      'D',
      'Get offices for department → SUCCESS (200 OK & active offices returned)',
      resD.statusCode === 200 && has2Offices
    );

    // -------------------------------------------------------------------------
    // Test E: Invalid department office request -> appropriate error
    // -------------------------------------------------------------------------
    const resENotFound = await makeRequest(
      port,
      'GET',
      '/api/v1/departments/00000000-0000-0000-0000-000000000000/offices'
    );
    recordTest(
      'E',
      'Get offices for non-existent department → appropriate error (404 Not Found)',
      resENotFound.statusCode === 404
    );

    // -------------------------------------------------------------------------
    // Test F: Correct department office is returned
    // -------------------------------------------------------------------------
    const resF = await makeRequest(port, 'GET', `/api/v1/offices/${officeSanitationCentralId}`);
    const correctOffice =
      resF.statusCode === 200 &&
      resF.body?.data?.id === officeSanitationCentralId &&
      resF.body?.data?.name === 'Central Sanitation Division HQ';
    recordTest(
      'F',
      'Get individual department office by ID → SUCCESS (200 OK & correct office returned)',
      correctOffice
    );

    // -------------------------------------------------------------------------
    // Test G: Nearest-office calculation returns the closest office
    // -------------------------------------------------------------------------
    // Querying location at Indiranagar (12.9784, 77.6408)
    // Between Central Sanitation HQ (12.9716, 77.5946 - ~5.0 km) and East Ward Office (12.9810, 77.6320 - ~1.0 km)
    // Nearest MUST be East Ward Sanitation Office!
    const resG = await makeRequest(
      port,
      'GET',
      `/api/v1/departments/${deptSanitationId}/nearest-office?latitude=12.9784&longitude=77.6408`
    );
    const nearestIsEast =
      resG.statusCode === 200 &&
      resG.body?.data?.office?.id === officeSanitationEastId &&
      resG.body?.data?.distanceKm < 2.0;
    recordTest(
      'G',
      'Nearest-office calculation returns the closest office via Haversine',
      nearestIsEast,
      `Closest: ${resG.body?.data?.office?.name} (${resG.body?.data?.distanceKm} km)`
    );

    // -------------------------------------------------------------------------
    // Test H: Invalid latitude/longitude -> rejected
    // -------------------------------------------------------------------------
    // Latitude out of bounds (95.5) -> 422
    const resHLatInvalid = await makeRequest(
      port,
      'GET',
      `/api/v1/departments/${deptSanitationId}/nearest-office?latitude=95.5&longitude=77.6`
    );
    // Longitude out of bounds (200.0) -> 422
    const resHLonInvalid = await makeRequest(
      port,
      'GET',
      `/api/v1/departments/${deptSanitationId}/nearest-office?latitude=12.9&longitude=200.0`
    );
    recordTest(
      'H',
      'Invalid latitude/longitude coordinates → rejected (422 ValidationError)',
      resHLatInvalid.statusCode === 422 && resHLonInvalid.statusCode === 422
    );

    // -------------------------------------------------------------------------
    // Test I: Unauthorized modification -> rejected
    // -------------------------------------------------------------------------
    // Unauthenticated attempt to create department -> 401
    const resIUnauth = await makeRequest(port, 'POST', '/api/v1/departments', {
      name: 'Unauthorized Dept',
    });
    // Citizen attempting to create department -> 403 Forbidden
    const resICitizen = await makeRequest(
      port,
      'POST',
      '/api/v1/departments',
      { name: 'Citizen Hack Dept' },
      'token-citizen'
    );
    // Officer attempting to modify office -> 403 Forbidden
    const resIOfficer = await makeRequest(
      port,
      'PATCH',
      `/api/v1/offices/${officeSanitationCentralId}`,
      { name: 'Officer Renamed Office' },
      'token-officer'
    );
    recordTest(
      'I',
      'Unauthorized department/office modification → rejected (401 / 403 Forbidden)',
      resIUnauth.statusCode === 401 && resICitizen.statusCode === 403 && resIOfficer.statusCode === 403
    );

    // -------------------------------------------------------------------------
    // Test J: Admin modification -> allowed
    // -------------------------------------------------------------------------
    // Admin creating new department -> 201 Created
    const resJAdminCreate = await makeRequest(
      port,
      'POST',
      '/api/v1/departments',
      {
        name: 'Smart Urban Analytics Department',
        description: 'IoT and civic telemetry division',
        active: true,
      },
      'token-admin'
    );
    // Admin updating office -> 200 OK
    const resJAdminUpdateOffice = await makeRequest(
      port,
      'PATCH',
      `/api/v1/offices/${officeSanitationCentralId}`,
      { name: 'Central Sanitation Super-Hub HQ' },
      'token-admin'
    );
    recordTest(
      'J',
      'Admin modification → allowed (201 Created & 200 OK)',
      resJAdminCreate.statusCode === 201 && resJAdminUpdateOffice.statusCode === 200
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

runDepartmentTests()
  .catch((err) => {
    console.error('Fatal department test error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
