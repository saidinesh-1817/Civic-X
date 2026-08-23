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

---

## 🔄 Status Workflow & Resolution System (B9)

### 1. Complete Complaint Lifecycle

```
       Citizen Submits
             │
             ▼
         ┌───────┐
         │  NEW  │
         └───┬───┘
             │ Officer Accepts (`POST /api/v1/officer/complaints/:id/assign`)
             ▼
        ┌──────────┐
        │ ASSIGNED │
        └────┬─────┘
             │ Assigned Officer Starts Work (`PATCH /api/v1/officer/complaints/:id/status`)
             ▼
       ┌─────────────┐
       │ IN_PROGRESS │
       └─────┬───────┘
             │ Assigned Officer Resolves with Photo Evidence (`POST /api/v1/officer/complaints/:id/resolve`)
             ▼
        ┌──────────┐
        │ RESOLVED │
        └──────────┘
```

---

### 2. Endpoints Specification

| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `PATCH` | `/api/v1/officer/complaints/:complaintId/status` | `APPROVED OFFICER` (Assigned) | Starts work on an assigned complaint (`ASSIGNED` $\rightarrow$ `IN_PROGRESS`). |
| `POST` | `/api/v1/officer/complaints/:complaintId/resolve` | `APPROVED OFFICER` (Assigned) | Resolves an in-progress complaint with photo evidence & notes (`IN_PROGRESS` $\rightarrow$ `RESOLVED`). |

---

### 3. Start Work (`PATCH /api/v1/officer/complaints/:complaintId/status`)

Transitions an assigned complaint to `IN_PROGRESS`.

#### Security & Access Rules:
- **Authenticated Approved Officer**: Requires a valid JWT from an `APPROVED` officer.
- **Department Boundary**: Complaint must belong to the officer's department (`403 Forbidden` on cross-department attempts).
- **Officer Assignment**: The officer must be assigned to the complaint (`403 Forbidden` if unassigned).
- **Valid Transition**: Strictly `ASSIGNED` $\rightarrow$ `IN_PROGRESS`.
- **Invalid Transitions**: Attempting to start work on a `NEW`, `IN_PROGRESS`, or `RESOLVED` complaint returns `400 BadRequestError`.

#### Request Body (`application/json`):
```json
{
  "status": "IN_PROGRESS",
  "note": "Maintenance team has arrived on site and started repairs."
}
```

#### Example Response (`200 OK`):
```json
{
  "success": true,
  "message": "Complaint status updated successfully",
  "data": {
    "id": "c1111111-1111-1111-1111-111111111111",
    "complaint_number": "CIV-100001",
    "title": "Garbage Dump Overflow",
    "status": "IN_PROGRESS",
    "status_history": [
      {
        "id": "sh-1",
        "status": "NEW",
        "note": "Complaint registered by citizen.",
        "created_at": "2026-08-18T10:00:00.000Z"
      },
      {
        "id": "sh-2",
        "status": "ASSIGNED",
        "note": "Inspector Ramesh taking ownership.",
        "created_at": "2026-08-21T10:16:52.000Z"
      },
      {
        "id": "sh-3",
        "status": "IN_PROGRESS",
        "note": "Maintenance team has arrived on site and started repairs.",
        "created_at": "2026-08-23T11:00:00.000Z"
      }
    ]
  }
}
```

---

### 4. Resolve Complaint (`POST /api/v1/officer/complaints/:complaintId/resolve`)

Resolves an `IN_PROGRESS` complaint with mandatory photo evidence and resolution notes.

#### Security & Access Rules:
- **Authenticated Approved Officer**: Requires valid JWT from an `APPROVED` officer.
- **Department Boundary**: Complaint must belong to the officer's department (`403 Forbidden` on mismatch).
- **Officer Assignment**: Officer must be assigned to the complaint (`403 Forbidden` if unassigned).
- **Mandatory Photo Evidence**: Photo payload (`photo`, `photo_url`, `resolution_photo`) is required; validated via magic-bytes (JPEG, PNG, WEBP, GIF, $\le 5\text{ MB}$).
- **Mandatory Resolution Note**: Clear explanation of resolution actions taken is required ($\le 5000\text{ characters}$).
- **Valid Transition**: Strictly `IN_PROGRESS` $\rightarrow$ `RESOLVED`.
- **Invalid Transitions**: Attempting to resolve a `NEW`, `ASSIGNED`, or already `RESOLVED` complaint returns `400 BadRequestError`.
- **Single Active Resolution**: Persisted in the `resolutions` table with a `@unique` constraint per complaint.

#### Request Body (`application/json`):
```json
{
  "note": "Garbage removed completely and the area has been disinfected.",
  "photo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
}
```

#### Example Response (`200 OK`):
```json
{
  "success": true,
  "message": "Complaint resolved successfully",
  "data": {
    "id": "c1111111-1111-1111-1111-111111111111",
    "complaint_number": "CIV-100001",
    "title": "Garbage Dump Overflow",
    "status": "RESOLVED",
    "resolution": {
      "id": "res-9182374981",
      "photo_url": "/uploads/resolutions/resolutions_1787464499107_74332b35ac55c92b.png",
      "note": "Garbage removed completely and the area has been disinfected.",
      "resolved_at": "2026-08-23T11:20:00.000Z",
      "created_at": "2026-08-23T11:20:00.000Z"
    },
    "status_history": [
      {
        "id": "sh-1",
        "status": "NEW",
        "note": "Complaint registered by citizen.",
        "created_at": "2026-08-18T10:00:00.000Z"
      },
      {
        "id": "sh-2",
        "status": "ASSIGNED",
        "note": "Inspector Ramesh taking ownership.",
        "created_at": "2026-08-21T10:16:52.000Z"
      },
      {
        "id": "sh-3",
        "status": "IN_PROGRESS",
        "note": "Maintenance team has arrived on site and started repairs.",
        "created_at": "2026-08-23T11:00:00.000Z"
      },
      {
        "id": "sh-4",
        "status": "RESOLVED",
        "note": "Garbage removed completely and the area has been disinfected.",
        "created_at": "2026-08-23T11:20:00.000Z"
      }
    ]
  }
}
```

---

## 🧪 Testing & Verification

### Run the B9 Status Workflow & Resolution Test Suite
```bash
npm run test:workflow
```

| Test ID | Scenario | Expected Result |
| :--- | :--- | :--- |
| **Test A** | Initial complaint state verification | `status = NEW` |
| **Test B** | Officer accepts complaint | Transitions `NEW` $\rightarrow$ `ASSIGNED` (`200 OK`) |
| **Test C** | Assigned officer starts work | Transitions `ASSIGNED` $\rightarrow$ `IN_PROGRESS` (`200 OK`) |
| **Test D** | Assigned officer resolves complaint | Transitions `IN_PROGRESS` $\rightarrow$ `RESOLVED` (`200 OK`) |
| **Test E** | Resolution photo verification | Safe filename saved to `/uploads/resolutions/` & verified on disk |
| **Test F** | Resolution record creation | Created with authentic `officer_id`, `photo_url`, `note`, `resolved_at` |
| **Test G** | Complete lifecycle timeline | Preserves `NEW` $\rightarrow$ `ASSIGNED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `RESOLVED` history |
| **Test H** | Unassigned officer attempts `IN_PROGRESS` | `403 Forbidden` |
| **Test I** | Officer from another department attempts modification | `403 Forbidden` |
| **Test J** | Citizen attempts officer status transitions | `403 Forbidden` |
| **Test K** | Direct `NEW` $\rightarrow$ `RESOLVED` skip attempt | `400/403 Error` |
| **Test K2** | Direct `ASSIGNED` $\rightarrow$ `RESOLVED` skip attempt | `400 BadRequestError` |
| **Test L** | Modifying or re-opening a `RESOLVED` complaint | `400 BadRequestError` |
| **Test M** | Resolve attempt with missing photo | `400/422 Validation error` |
| **Test N** | Resolve attempt with missing note | `400/422 Validation error` |
| **Test O** | Citizen visibility (B7 `GET /complaints/:id`) | Citizen sees status `RESOLVED`, resolution photo/note, and complete timeline |
| **Test P** | Officer visibility (B8 `GET /officer/complaints/:id`) | Officer sees updated `RESOLVED` state and resolution details |

---

### Run Full Test Suite Across All Modules

```bash
# Run B9 Status Workflow & Resolution Tests
npm run test:workflow

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
