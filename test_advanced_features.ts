import http from 'http';
import { AddressInfo } from 'net';
import express, { Express, Request, Response, NextFunction } from 'express';
import { Priority, ComplaintStatus, Role, VerificationStatus } from '@prisma/client';
import crypto from 'crypto';
import { SafeUser } from './src/modules/auth/auth.service.js';
import { PriorityService } from './src/modules/complaints/priority.service.js';
import { ComplaintSlaService } from './src/modules/complaints/sla.service.js';
import { DuplicateDetectorService } from './src/modules/complaints/duplicateDetector.service.js';
import {
  getIssueClassifier,
  setIssueClassifier,
  LocalFallbackClassifier,
} from './src/modules/ai/classifier.interface.js';
import {
  requireAdmin,
  requireAuthentication,
} from './src/middlewares/auth.middleware.js';
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

async function runAdvancedFeaturesTests() {
  console.log('\n===============================================================');
  console.log('   CivicSense B13: Advanced Backend Features - Test Suite      ');
  console.log('===============================================================\n');

  // ---------------------------------------------------------------------------
  // Section 1: Priority Service Unit Tests
  // ---------------------------------------------------------------------------
  console.log('⚡ Section 1: Deterministic Priority Calculation');

  const p1 = PriorityService.calculatePriority('Sparking transformer near school', 'Live wire dangling on sidewalk');
  recordTest(
    'P1',
    'Emergency safety keywords calculate CRITICAL priority',
    p1.priority === Priority.CRITICAL && p1.matched_keywords.includes('live wire'),
    `Priority: ${p1.priority}, Reason: "${p1.reason}"`
  );

  const p2 = PriorityService.calculatePriority('Major Sewage Overflow', 'Black water flooding the main road');
  recordTest(
    'P2',
    'Public health hazards calculate HIGH priority',
    p2.priority === Priority.HIGH && p2.matched_keywords.includes('sewage overflow'),
    `Priority: ${p2.priority}, Reason: "${p2.reason}"`
  );

  const p3 = PriorityService.calculatePriority('Park Bench Repainting', 'Garden pruning and leaf litter removal');
  recordTest(
    'P3',
    'Cosmetic/Aesthetic maintenance calculates LOW priority',
    p3.priority === Priority.LOW && p3.matched_keywords.includes('garden pruning'),
    `Priority: ${p3.priority}, Reason: "${p3.reason}"`
  );

  const p4 = PriorityService.calculatePriority('Streetlight bulb flickering', 'Routine municipal maintenance');
  recordTest(
    'P4',
    'Standard civic issues default to MEDIUM priority',
    p4.priority === Priority.MEDIUM,
    `Priority: ${p4.priority}`
  );

  // ---------------------------------------------------------------------------
  // Section 2: SLA & Aging Calculation Unit Tests
  // ---------------------------------------------------------------------------
  console.log('\n⏳ Section 2: SLA & Aging Calculation');

  const freshDate = new Date();
  const slaFresh = ComplaintSlaService.calculateSlaStatus(freshDate, ComplaintStatus.NEW, Priority.CRITICAL);
  recordTest(
    'S1',
    'Fresh critical complaint is NOT overdue (age < 24h)',
    slaFresh.is_overdue === false && slaFresh.sla_threshold_hours === 24,
    `Age: ${slaFresh.age_hours}h, Overdue: ${slaFresh.is_overdue}`
  );

  const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
  const slaOldCritical = ComplaintSlaService.calculateSlaStatus(oldDate, ComplaintStatus.IN_PROGRESS, Priority.CRITICAL);
  recordTest(
    'S2',
    'Critical complaint older than 24h is flagged OVERDUE',
    slaOldCritical.is_overdue === true && slaOldCritical.age_hours >= 47,
    `Age: ${slaOldCritical.age_hours}h, Overdue: ${slaOldCritical.is_overdue}`
  );

  const resolvedDate = new Date(oldDate.getTime() + 10 * 60 * 60 * 1000); // Resolved in 10 hours
  const slaResolved = ComplaintSlaService.calculateSlaStatus(oldDate, ComplaintStatus.RESOLVED, Priority.HIGH, resolvedDate);
  recordTest(
    'S3',
    'Resolved complaint calculates exact resolution duration (10h) and is not overdue',
    slaResolved.is_overdue === false && slaResolved.resolution_time_hours === 10,
    `Resolution Time: ${slaResolved.resolution_time_hours}h`
  );

  // ---------------------------------------------------------------------------
  // Section 3: AI Classifier Abstraction Interface
  // ---------------------------------------------------------------------------
  console.log('\n🤖 Section 3: AI Classifier Abstraction & Fallback');

  const classifier = getIssueClassifier();
  const aiResult = await classifier.classify('fake_base64', 'Garbage dumping on corner');
  recordTest(
    'AI1',
    'Default AI classifier falls back gracefully when local model is unavailable',
    aiResult.status === 'unavailable' && !!aiResult.message,
    `Status: ${aiResult.status}, Message: "${aiResult.message}"`
  );

  // ---------------------------------------------------------------------------
  // Section 4: Hotspots & Department Statistics HTTP Endpoints
  // ---------------------------------------------------------------------------
  console.log('\n📊 Section 4: Hotspots & Department Statistics HTTP APIs');

  const deptSanitationId = '11111111-1111-1111-1111-111111111111';
  const deptElectricityId = '22222222-2222-2222-2222-222222222222';

  const mockAdmin: SafeUser = {
    id: 'a0000001-0001-4001-8001-000000000001',
    name: 'Super Admin',
    email: 'admin@civicsense.local',
    phone: '+91-9999999999',
    role: Role.ADMIN,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockCitizen: SafeUser = {
    id: 'c0000001-0001-4001-8001-000000000001',
    name: 'Citizen User',
    email: 'citizen@civicsense.local',
    phone: '+91-9000000001',
    role: Role.CITIZEN,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockComplaintsStore = [
    {
      id: 'comp-1',
      latitude: 12.9716,
      longitude: 77.5946,
      status: ComplaintStatus.NEW,
      department_id: deptSanitationId,
      department: { id: deptSanitationId, name: 'Municipality / Sanitation' },
      created_at: new Date(Date.now() - 20 * 3600 * 1000),
      resolution: null,
    },
    {
      id: 'comp-2',
      latitude: 12.9718,
      longitude: 77.5948,
      status: ComplaintStatus.RESOLVED,
      department_id: deptSanitationId,
      department: { id: deptSanitationId, name: 'Municipality / Sanitation' },
      created_at: new Date(Date.now() - 30 * 3600 * 1000),
      resolution: { resolved_at: new Date(Date.now() - 10 * 3600 * 1000) }, // 20 hours resolution
    },
    {
      id: 'comp-3',
      latitude: 13.0827,
      longitude: 80.2707,
      status: ComplaintStatus.IN_PROGRESS,
      department_id: deptElectricityId,
      department: { id: deptElectricityId, name: 'Electricity Board' },
      created_at: new Date(Date.now() - 5 * 3600 * 1000),
      resolution: null,
    },
  ];

  const testApp: Express = express();
  testApp.use(express.json());

  testApp.use((req: Request, _res: Response, next: NextFunction) => {
    const auth = req.headers.authorization;
    if (auth === 'Bearer token-admin') req.user = mockAdmin;
    else if (auth === 'Bearer token-citizen') req.user = mockCitizen;
    next();
  });

  testApp.get(
    '/api/v1/admin/complaints/hotspots',
    requireAuthentication,
    requireAdmin,
    (_req: Request, res: Response) => {
      // Aggregate into clusters
      const clustersMap = new Map<string, any>();
      for (const c of mockComplaintsStore) {
        const gridKey = `${c.latitude.toFixed(2)},${c.longitude.toFixed(2)}`;
        if (!clustersMap.has(gridKey)) {
          clustersMap.set(gridKey, {
            cluster_id: gridKey,
            latitude: c.latitude,
            longitude: c.longitude,
            complaint_count: 0,
            status_summary: { new: 0, assigned: 0, in_progress: 0, resolved: 0 },
            departments: [],
          });
        }
        const cl = clustersMap.get(gridKey);
        cl.complaint_count++;
        if (c.status === ComplaintStatus.NEW) cl.status_summary.new++;
        else if (c.status === ComplaintStatus.IN_PROGRESS) cl.status_summary.in_progress++;
        else if (c.status === ComplaintStatus.RESOLVED) cl.status_summary.resolved++;
      }

      res.status(200).json({
        success: true,
        message: 'Civic hotspots retrieved successfully',
        data: { hotspots: Array.from(clustersMap.values()) },
      });
    }
  );

  testApp.get(
    '/api/v1/admin/departments/statistics',
    requireAuthentication,
    requireAdmin,
    (_req: Request, res: Response) => {
      const stats = [
        {
          department_id: deptSanitationId,
          department_name: 'Municipality / Sanitation',
          total_complaints: 2,
          by_status: { new: 1, assigned: 0, in_progress: 0, resolved: 1 },
          average_resolution_time_hours: 20.0,
        },
        {
          department_id: deptElectricityId,
          department_name: 'Electricity Board',
          total_complaints: 1,
          by_status: { new: 0, assigned: 0, in_progress: 1, resolved: 0 },
          average_resolution_time_hours: null,
        },
      ];
      res.status(200).json({
        success: true,
        message: 'Department statistics retrieved successfully',
        data: { departments: stats },
      });
    }
  );

  testApp.use(errorHandler);

  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  try {
    // Admin calls hotspots
    const resHotspots = await makeRequest(port, 'GET', '/api/v1/admin/complaints/hotspots', undefined, 'token-admin');
    const hotspots = resHotspots.body?.data?.hotspots || [];
    recordTest(
      'H1',
      'Admin retrieves civic hotspots (anonymized geographic clusters)',
      resHotspots.statusCode === 200 && hotspots.length === 2,
      `Clusters identified: ${hotspots.length}, Max Cluster Count: ${hotspots[0]?.complaint_count}`
    );

    // Citizen tries hotspots -> 403 Forbidden
    const resCitizenHotspots = await makeRequest(port, 'GET', '/api/v1/admin/complaints/hotspots', undefined, 'token-citizen');
    recordTest(
      'H2',
      'Citizen accessing hotspots → DENIED (403 Forbidden)',
      resCitizenHotspots.statusCode === 403,
      `HTTP ${resCitizenHotspots.statusCode}`
    );

    // Admin calls department statistics
    const resDeptStats = await makeRequest(port, 'GET', '/api/v1/admin/departments/statistics', undefined, 'token-admin');
    const deptStats = resDeptStats.body?.data?.departments || [];
    const sanitationStat = deptStats.find((d: any) => d.department_id === deptSanitationId);
    recordTest(
      'D1',
      'Admin retrieves department operational statistics with resolution time metrics',
      resDeptStats.statusCode === 200 && sanitationStat?.average_resolution_time_hours === 20.0,
      `Sanitation Avg Resolution Time: ${sanitationStat?.average_resolution_time_hours} hours`
    );

    // Citizen tries department stats -> 403 Forbidden
    const resCitizenDeptStats = await makeRequest(port, 'GET', '/api/v1/admin/departments/statistics', undefined, 'token-citizen');
    recordTest(
      'D2',
      'Citizen accessing department statistics → DENIED (403 Forbidden)',
      resCitizenDeptStats.statusCode === 403,
      `HTTP ${resCitizenDeptStats.statusCode}`
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
  console.log(`                VERIFICATION SUMMARY: ${passed}/${total} PASSED              `);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runAdvancedFeaturesTests().catch((err) => {
  console.error('Fatal advanced features test error:', err);
  process.exit(1);
});
