# CivicSense - Backend & Database Infrastructure

CivicSense is a modern civic issue reporting and resolution platform. This repository contains the backend API foundation, relational database, role-based authentication, department-based authorization, department/office management, complaint creation, citizen complaint tracking, and officer complaint management infrastructure built with **Node.js**, **Express**, **TypeScript**, **PostgreSQL**, and **Prisma ORM**.

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
├── test_departments.ts           # B5 Department & Office Management test suite
├── test_complaints.ts            # B6 Complaint Creation & Submission test suite
├── test_complaint_retrieval.ts   # B7 Complaint Retrieval & Citizen Tracking test suite
├── test_officer_complaints.ts    # B8 Officer Complaint Management test suite
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
    │   ├── fileStorage.ts        # File storage & image validation utility
    │   ├── geo.ts                # Geodesic & Haversine distance calculation utilities
    │   ├── apiResponse.ts        # Standardized success/error JSON response utility
    │   ├── apiError.ts           # Custom operational HTTP error hierarchy
    │   └── logger.ts             # Application logger
    ├── routes/
    │   ├── index.ts              # Root /api aggregator
    │   └── v1/
    │       ├── index.ts          # Versioned /api/v1 router (mounts /auth, /departments, /offices, /complaints, /officer, /test)
    │       ├── health.route.ts   # Health check route
    │       └── test.route.ts     # Diagnostic & RBAC/DAC test route
    └── modules/
        ├── auth/                 # B3: Authentication & Role-Based Access Control (RBAC)
        │   ├── auth.controller.ts# Auth HTTP handlers
        │   ├── auth.service.ts   # Auth business logic, token issuing & verification
        │   ├── auth.schema.ts    # Zod input validation schemas
        │   └── auth.route.ts     # /api/v1/auth router definitions
        ├── departments/          # B5: Departments & Department Offices Management
        │   ├── departments.controller.ts # Department & Office HTTP handlers
        │   ├── departments.service.ts    # Business logic & Haversine nearest-office locator
        │   ├── departments.schema.ts     # Zod input & coordinate validation schemas
        │   └── departments.route.ts      # /api/v1/departments & /api/v1/offices router definitions
        ├── complaints/           # B6 & B7: Complaint Creation, Retrieval & Citizen Tracking
        │   ├── complaints.controller.ts  # Complaint HTTP handlers
        │   ├── complaints.service.ts     # Complaint lifecycle, auto-routing & tracking logic
        │   ├── complaints.schema.ts      # Zod complaint submission & query schemas
        │   └── complaints.route.ts       # /api/v1/complaints router definitions
        ├── officers/             # B8: Officer Complaint Management & Processing
        │   ├── officers.controller.ts    # Officer queue & assignment HTTP handlers
        │   ├── officers.service.ts       # Department queue, boundaries & assignment logic
        │   ├── officers.schema.ts        # Zod input & query validation schemas
        │   └── officers.route.ts         # /api/v1/officer router definitions
        ├── users/                # Future: Citizen profiles & preferences
        ├── notifications/        # Future: Multi-channel notifications (Push, SMS, Email)
        └── administration/       # Future: Administrative controls, wards & metrics
```

---

## 👮 Officer Complaint Management (B8)

### 1. Endpoints Specification

| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/officer/complaints` | `APPROVED OFFICER` | Lists complaints assigned to the officer's department with filters and pagination. |
| `GET` | `/api/v1/officer/complaints/:complaintId` | `APPROVED OFFICER` | Retrieves complaint details, location, status timeline, and assignment history within the officer's department. |
| `POST` | `/api/v1/officer/complaints/:complaintId/assign` | `APPROVED OFFICER` | Accepts and assigns a `NEW` complaint to the authenticated officer (`NEW` $\rightarrow$ `ASSIGNED`). |

---

### 2. Officer Complaint List (`GET /api/v1/officer/complaints`)

#### Query Parameters:
- `page` (integer, optional, default: 1): Page number ($\ge 1$).
- `limit` (integer, optional, default: 10, max: 50): Number of records per page.
- `status` (enum, optional): `NEW`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`.
- `priority` (enum, optional): `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.
- `office_id` (UUID, optional): Filter by department branch office.
- `from_date` / `to_date` (ISO Datetime, optional): Date range filter.

#### Example Request:
```bash
GET /api/v1/officer/complaints?status=NEW&priority=HIGH HTTP/1.1
Host: localhost:5000
Authorization: Bearer <APPROVED_OFFICER_JWT>
```

#### Example Response (`200 OK`):
```json
{
  "success": true,
  "message": "Department complaints retrieved successfully",
  "data": {
    "complaints": [
      {
        "id": "c1111111-1111-1111-1111-111111111111",
        "complaint_number": "CIV-100001",
        "title": "Garbage Dump Overflow",
        "description": "Solid waste uncollected for 3 days.",
        "photo_url": "/uploads/complaints/garbage.jpg",
        "latitude": 12.981,
        "longitude": 77.632,
        "priority": "HIGH",
        "status": "NEW",
        "department": {
          "id": "11111111-1111-1111-1111-111111111111",
          "name": "Municipality / Sanitation"
        },
        "office": {
          "id": "aaaa2222-2222-2222-2222-222222222222",
          "name": "East Ward Sanitation Office",
          "address": "Building B, Indiranagar"
        },
        "created_at": "2026-08-18T10:00:00.000Z",
        "updated_at": "2026-08-18T10:00:00.000Z",
        "assignment": null
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "total_pages": 1
    }
  }
}
```

---

### 3. Accept & Assign Complaint (`POST /api/v1/officer/complaints/:complaintId/assign`)

#### Request Body (`application/json`):
```json
{
  "action": "ACCEPT",
  "note": "Officer taking ownership for field inspection."
}
```

#### Transition Rules:
- **Valid Transition**: `NEW` $\rightarrow$ `ASSIGNED`.
- **Invalid Transitions**: Attempting to accept a complaint that is already `ASSIGNED`, `IN_PROGRESS`, or `RESOLVED` returns `400 BadRequestError`.
- **Department Boundary**: Attempting to accept a complaint from another department returns `403 Forbidden`.

#### Example Response (`200 OK`):
```json
{
  "success": true,
  "message": "Complaint accepted and assigned successfully",
  "data": {
    "id": "c1111111-1111-1111-1111-111111111111",
    "complaint_number": "CIV-100001",
    "title": "Garbage Dump Overflow",
    "status": "ASSIGNED",
    "assignments": [
      {
        "id": "asgn-1",
        "officer_id": "prof-off-sanitation-1",
        "officer_name": "Inspector Ramesh",
        "designation": "Sanitation Chief Inspector",
        "assigned_at": "2026-08-21T10:16:52.000Z"
      }
    ],
    "status_history": [
      {
        "id": "sh-1",
        "status": "NEW",
        "note": "Registered by citizen.",
        "created_at": "2026-08-18T10:00:00.000Z"
      },
      {
        "id": "sh-2",
        "status": "ASSIGNED",
        "note": "Officer taking ownership for field inspection.",
        "created_at": "2026-08-21T10:16:52.000Z"
      }
    ]
  }
}
```

---

## 🧪 Testing & Verification

### Run the B8 Officer Complaint Test Suite
```bash
npm run test:officers
```

| Test ID | Scenario | Expected Result |
| :--- | :--- | :--- |
| **Test A** | Approved Municipality officer lists Municipality complaints | `200 OK` + department complaints list |
| **Test B** | Query param injection (`?department_id=...`) to access other departments | Ignored; strictly scoped to officer department |
| **Test C** | Approved officer opens own department complaint | `200 OK` + complete timeline + assignment info |
| **Test D** | Officer opens another department's complaint | `403 Forbidden` |
| **Test E** | Officer accepts NEW complaint | `200 OK` + updated complaint |
| **Test F** | Complaint status transition | Transitions `NEW` $\rightarrow$ `ASSIGNED` |
| **Test G** | `ComplaintAssignment` record | Created with authentic `officer_id` and `assigned_by` |
| **Test H** | `ComplaintStatusHistory` record | Logged with `status = ASSIGNED` and officer note |
| **Test I** | Citizen tries officer endpoint | `403 Forbidden` |
| **Test J** | Pending / Rejected officer tries officer endpoint | `403 Forbidden` |
| **Test K** | Officer tries to spoof `officer_id` in request body | Ignored; authentic server-side identity used |
| **Test L** | Officer attempts to accept an already ASSIGNED complaint | `400 BadRequestError` |
| **Test M** | Filtering by `priority`, `status`, and `office_id` | Accurate results within department boundaries |

---

### Run Full Test Suite Across All Modules

```bash
# Run B8 Officer Complaint Management Tests
npm run test:officers

# Run B7 Complaint Retrieval Tests
npm run test:retrieval

# Run B6 Complaint Creation Tests
npm run test:complaints

# Run B5 Department & Office Management Tests
npm run test:departments

# Run B4 Authorization & Department Access Control Tests
npm run test:authz

# Run B3 Authentication & RBAC Tests
npm run test:auth

# Run B1/B2 Database Schema Integrity Checks
npm run test:db

# Run TypeScript Linting & Compilation Build
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
