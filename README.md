# CivicSense - Backend & Database Infrastructure

CivicSense is a modern civic issue reporting and resolution platform. This repository contains the backend API foundation, relational database, role-based authentication, and department-based authorization infrastructure built with **Node.js**, **Express**, **TypeScript**, **PostgreSQL**, and **Prisma ORM**.

---

## 🏗️ Project Architecture & Structure

```
civicsense-backend/
├── .env.example                  # Template for environment variables
├── .env                          # Local environment settings (gitignored)
├── .gitignore                    # Git ignore file
├── package.json                  # Project dependencies & scripts
├── tsconfig.json                 # Strict TypeScript configuration
├── test_endpoints.js             # HTTP API base endpoint verification script
├── test_database.ts              # Database schema & integrity verification suite
├── test_auth.ts                  # B3 Authentication verification test suite
├── test_authorization.ts         # B4 Authorization & Department Access Control test suite
├── README.md                     # Documentation
├── prisma/
│   ├── schema.prisma             # PostgreSQL schema definition & models
│   ├── seed.ts                   # Comprehensive database seed script
│   └── migrations/
│       └── 20260819000000_init/  # SQL DDL migration files
│           └── migration.sql
└── src/
    ├── server.ts                 # Server entrypoint with graceful shutdown & signal traps
    ├── app.ts                    # Express application factory & middleware pipeline
    ├── config/
    │   ├── env.config.ts         # Type-safe environment variable parsing & defaults
    │   ├── cors.config.ts        # CORS configuration for frontend applications
    │   └── database.ts           # Singleton Prisma Client & connection lifecycle
    ├── middlewares/
    │   ├── auth.middleware.ts    # Centralized auth & authorization exports
    │   ├── authorization.middleware.ts # RBAC, department access & resource ownership middlewares
    │   ├── error.middleware.ts   # Centralized 404 and global error handler
    │   ├── logging.middleware.ts # HTTP request logger (colored dev / structured prod)
    │   ├── rateLimiter.middleware.ts # General security rate limiting middleware
    │   └── validate.middleware.ts # Zod-based request validation middleware
    ├── utils/
    │   ├── authHelpers.ts        # Pure, reusable authorization helpers (department, ownership, roles)
    │   ├── apiResponse.ts        # Standardized success/error JSON response utility
    │   ├── apiError.ts           # Custom operational HTTP error hierarchy
    │   └── logger.ts             # Application logger
    ├── routes/
    │   ├── index.ts              # Root /api aggregator
    │   └── v1/
    │       ├── index.ts          # Versioned /api/v1 router (mounts /auth, /health, /test)
    │       ├── health.route.ts   # Health check route
    │       └── test.route.ts     # Diagnostic & RBAC/DAC test route
    └── modules/
        ├── auth/                 # B3: Authentication & Role-Based Access Control (RBAC)
        │   ├── auth.controller.ts# Auth HTTP handlers
        │   ├── auth.service.ts   # Auth business logic, token issuing & verification
        │   ├── auth.schema.ts    # Zod input validation schemas
        │   └── auth.route.ts     # /api/v1/auth router definitions
        ├── users/                # Future: Citizen profiles & preferences
        ├── departments/          # Future: Civic departments & SLAs
        ├── complaints/           # Future: Issue reporting, tracking & resolution workflows
        ├── notifications/        # Future: Multi-channel notifications (Push, SMS, Email)
        ├── officers/             # Future: Field officer assignments & management
        └── administration/       # Future: Administrative controls, wards & metrics
```

---

## 🔒 Authentication vs. Authorization

CivicSense maintains a clear separation between **Authentication (B3)** and **Authorization (B4)**:

| Concept | Layer | Purpose | HTTP Failure |
| :--- | :--- | :--- | :--- |
| **Authentication** | `authenticate`, `requireAuthentication` | **"Who are you?"** Validates JWT bearer tokens, checks token expiry, and resolves the live database user record to `req.user`. | `401 Unauthorized` |
| **Authorization** | `requireRoles`, `requireCitizen`, `requireOfficer`, `requireAdmin`, `requireDepartmentAccess`, `requireResourceOwner` | **"What are you allowed to do?"** Evaluates whether the authenticated user has permission to access a specific resource or department. | `403 Forbidden` |

---

## 🛡️ Authorization & Department Access Control (B4)

### 1. Role Permissions Matrix

| Role | Permitted Actions | Restricted Actions |
| :--- | :--- | :--- |
| `CITIZEN` | • Register & log in immediately<br>• Access personal citizen endpoints<br>• Access and manage own complaints & notifications | • Cannot access officer endpoints (`403 Forbidden`)<br>• Cannot access admin endpoints (`403 Forbidden`)<br>• Cannot access other citizens' private resources |
| `OFFICER` | • Register account (status: `PENDING`)<br>• Once `APPROVED`, log in and access officer workflows<br>• Access department-specific issues belonging to **their assigned department only** | • `PENDING` or `REJECTED` officers cannot access protected officer endpoints (`403 Forbidden`)<br>• Cannot access resources belonging to other civic departments (`403 Forbidden`)<br>• Cannot access admin endpoints (`403 Forbidden`) |
| `ADMIN` | • Manage system configuration & users<br>• Approve or reject officer registrations<br>• Super-access: view & manage resources across **all departments** | • N/A (Full platform administrative access) |

---

### 2. Officer Verification Rules

Every officer account lifecycle follows strict state transitions:

```
[Register] ──> PENDING ──┬──> (Admin Approves) ──> APPROVED (Full officer access to assigned department)
                         └──> (Admin Rejects)  ──> REJECTED (Denied access - 403 Forbidden)
```

- **Rule 1**: Every officer belongs to **exactly one department** mapped through `officer_profiles.department_id`.
- **Rule 2**: An officer can access protected officer functionality **ONLY** when `role = OFFICER` **AND** `verification_status = APPROVED`.
- **Rule 3**: `PENDING` and `REJECTED` officers are denied access (`403 Forbidden`) across all officer endpoints.

---

### 3. Department Access Control Rules & Zero-Trust Security

- **Server-Authoritative Identity**: Permissions, officer department associations, user IDs, and roles are **never trusted from the frontend payload** (request body, headers, or query parameters).
- **Single Source of Truth**: The authenticated user's database record (`req.user` / `req.user.officer_profile`) is the single source of truth.
- **Cross-Department Isolation**: An officer assigned to **Municipality / Sanitation** cannot view or modify resources belonging to **Electricity**, **Water Supply**, **Roads & Infrastructure**, or any other department (`403 Forbidden`).
- **Administrative Override**: Users with role `ADMIN` have administrative access across all departments.

---

### 4. Citizen Resource Ownership

- A citizen can only access resources belonging to their own user account (`req.user.id === resource.citizen_id`).
- Attempting to access another citizen's resource returns `403 Forbidden`.
- Platform administrators retain administrative access across resources.

---

### 5. Reusable Middleware & Helper Suite

The authorization layer provides reusable middlewares and utility helpers for all future modules:

#### Middlewares (`src/middlewares/auth.middleware.ts` or `src/middlewares/authorization.middleware.ts`):
```typescript
import {
  requireAuthentication,
  requireCitizen,
  requireOfficer,
  requireApprovedOfficer,
  requireAdmin,
  requireRoles,
  requireDepartmentAccess,
  requireResourceOwner,
} from './middlewares/auth.middleware.js';

// Examples:
router.get('/citizen-data', requireAuthentication, requireCitizen, handler);
router.get('/admin-dashboard', requireAuthentication, requireAdmin, handler);
router.get('/staff-only', requireAuthentication, requireRoles(Role.OFFICER, Role.ADMIN), handler);
router.get('/dept-issues/:departmentId', requireAuthentication, requireDepartmentAccess(), handler);
router.get('/users/:userId/data', requireAuthentication, requireResourceOwner(), handler);
```

#### Helper Utilities (`src/utils/authHelpers.ts`):
```typescript
import {
  getAuthenticatedUser,
  requireApprovedOfficer,
  checkDepartmentAccess,
  assertDepartmentAccess,
  checkResourceOwner,
  assertResourceOwner,
} from './utils/authHelpers.js';

// Examples in services/controllers:
const user = getAuthenticatedUser(req);
const officerProfile = requireApprovedOfficer(user);
assertDepartmentAccess(user, targetDepartmentId);
assertResourceOwner(user, resourceOwnerId);
```

---

## 🧪 Testing & Verification

### Run the B4 Authorization Test Suite
Executes unit tests and live HTTP integration tests for all **11 required test cases (A through K + Resource Ownership)**:

```bash
npm run test:authz
```

| Test Case | Scenario | Expected Result |
| :--- | :--- | :--- |
| **Test A** | Unauthenticated user → protected endpoint | `401 Unauthorized` |
| **Test B** | Citizen → citizen endpoint | `200 OK` (Allowed) |
| **Test C** | Citizen → officer endpoint | `403 Forbidden` |
| **Test D** | Citizen → admin endpoint | `403 Forbidden` |
| **Test E** | Approved officer → officer endpoint | `200 OK` (Allowed) |
| **Test F** | Pending officer → officer endpoint | `403 Forbidden` |
| **Test G** | Rejected officer → officer endpoint | `403 Forbidden` |
| **Test H** | Officer → admin endpoint | `403 Forbidden` |
| **Test I** | Admin → admin endpoint | `200 OK` (Allowed) |
| **Test J** | Officer from Dept A → protected Dept B resource | `403 Forbidden` (Dept A allowed, Dept B blocked) |
| **Test K** | Officer attempts to manipulate `department_id` in request | `403 Forbidden` (Database profile is source of truth) |
| **Test L** | Citizen Resource Ownership & Isolation | `200 OK` for own resource, `403 Forbidden` for other's resource, `200 OK` for Admin |

---

### Run All Test Suites

```bash
# Run B4 Authorization Tests
npm run test:authz

# Run B3 Authentication Tests
npm run test:auth

# Run B1/B2 Database Schema Integrity Checks
npm run test:db

# Run TypeScript Linting & Build
npm run lint
npm run build
```

---

## ⚙️ Environment Variables

Add the following to your `.env` file (see `.env.example`):

```env
# Server
NODE_ENV=development
PORT=5000
API_PREFIX=/api
CORS_ORIGIN=http://localhost:3000,http://localhost:5173

# Database (PostgreSQL)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/civicsense?schema=public"

# Authentication & JWT Configuration
JWT_SECRET="civicsense_jwt_secure_dev_secret_key_2026_!@#987"
JWT_EXPIRES_IN="7d"

# Seed Admin Credentials
ADMIN_EMAIL="demo.admin@civicsense.local"
ADMIN_PASSWORD="AdminSecure123!"

# Rate Limiting
RATE_LIMIT_WINDOW_MINUTES=15
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX_REQUESTS=30
```
