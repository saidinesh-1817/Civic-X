# CivicSense - Backend & Database Infrastructure

CivicSense is a modern civic issue reporting and resolution platform. This repository contains the backend API foundation, relational database, role-based authentication, department-based authorization, department/office management, complaint creation, and citizen complaint tracking infrastructure built with **Node.js**, **Express**, **TypeScript**, **PostgreSQL**, and **Prisma ORM**.

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
    │       ├── index.ts          # Versioned /api/v1 router (mounts /auth, /departments, /offices, /complaints, /test)
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
        ├── users/                # Future: Citizen profiles & preferences
        ├── notifications/        # Future: Multi-channel notifications (Push, SMS, Email)
        ├── officers/             # Future: Field officer assignments & management
        └── administration/       # Future: Administrative controls, wards & metrics
```

---

## 🔍 Complaint Retrieval & Citizen Tracking (B7)

### 1. Endpoints Specification

| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/complaints/my` | `CITIZEN` | Retrieves paginated complaints submitted by the authenticated citizen with optional filters. |
| `POST` | `/api/v1/complaints` | `CITIZEN` | Submit a new civic issue report. |
| `GET` | `/api/v1/complaints/:complaintId` | `CITIZEN` (Owner) / `ADMIN` | Retrieves detailed single complaint metadata, full chronological status history, and resolution info. |

---

### 2. Citizen Complaint List (`GET /api/v1/complaints/my`)

#### Query Parameters:
- `page` (integer, optional, default: 1): Page number ($\ge 1$).
- `limit` (integer, optional, default: 10, max: 50): Number of records per page.
- `status` (enum, optional): Filter by `NEW`, `ASSIGNED`, `IN_PROGRESS`, or `RESOLVED`.
- `department_id` (UUID, optional): Filter by specific department.

#### Example Request:
```bash
GET /api/v1/complaints/my?page=1&limit=10&status=NEW HTTP/1.1
Host: localhost:5000
Authorization: Bearer <CITIZEN_JWT_TOKEN>
```

#### Example Response (`200 OK`):
```json
{
  "success": true,
  "message": "Citizen complaints retrieved successfully",
  "data": {
    "complaints": [
      {
        "id": "c1111111-1111-1111-1111-111111111111",
        "complaint_number": "CIV-100001",
        "title": "Pothole on Main St",
        "department": {
          "id": "11111111-1111-1111-1111-111111111111",
          "name": "Municipality / Sanitation"
        },
        "office": {
          "id": "aaaa1111-1111-1111-1111-111111111111",
          "name": "Central Office",
          "address": "Plot 101, Central Zone"
        },
        "photo_url": "/uploads/complaints/complaints_1787305809782_3a8ecb7a32f69dba.png",
        "priority": "HIGH",
        "status": "NEW",
        "created_at": "2026-08-21T09:50:09.000Z",
        "updated_at": "2026-08-21T09:50:09.000Z"
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

### 3. Single Complaint Details (`GET /api/v1/complaints/:complaintId`)

#### Example Request:
```bash
GET /api/v1/complaints/c1111111-1111-1111-1111-111111111111 HTTP/1.1
Host: localhost:5000
Authorization: Bearer <CITIZEN_JWT_TOKEN>
```

#### Example Response (`200 OK`):
```json
{
  "success": true,
  "message": "Complaint details retrieved successfully",
  "data": {
    "id": "c1111111-1111-1111-1111-111111111111",
    "complaint_number": "CIV-100001",
    "title": "Pothole on Main St",
    "description": "Deep dangerous pothole near junction.",
    "photo_url": "/uploads/complaints/pothole1.jpg",
    "latitude": 12.9716,
    "longitude": 77.5946,
    "priority": "HIGH",
    "status": "RESOLVED",
    "department": {
      "id": "11111111-1111-1111-1111-111111111111",
      "name": "Municipality / Sanitation",
      "description": "Sanitation"
    },
    "office": {
      "id": "aaaa1111-1111-1111-1111-111111111111",
      "name": "Central Office",
      "address": "Plot 101",
      "latitude": 12.97,
      "longitude": 77.59
    },
    "citizen": {
      "id": "user-citizen-a",
      "name": "Aarav Sharma",
      "email": "aarav.sharma@civicsense.local"
    },
    "created_at": "2026-08-10T10:00:00.000Z",
    "updated_at": "2026-08-12T15:00:00.000Z",
    "status_history": [
      {
        "id": "sh-1",
        "status": "NEW",
        "note": "Registered by citizen",
        "created_at": "2026-08-10T10:00:00.000Z"
      },
      {
        "id": "sh-2",
        "status": "ASSIGNED",
        "note": "Assigned to crew",
        "created_at": "2026-08-11T09:00:00.000Z"
      },
      {
        "id": "sh-3",
        "status": "RESOLVED",
        "note": "Pothole filled and cured",
        "created_at": "2026-08-12T15:00:00.000Z"
      }
    ],
    "resolution": {
      "id": "res-1",
      "photo_url": "/uploads/resolutions/pothole_fixed.jpg",
      "note": "Road patch complete with bitumen.",
      "resolved_at": "2026-08-12T15:00:00.000Z",
      "created_at": "2026-08-12T15:00:00.000Z"
    }
  }
}
```

---

## 🧪 Testing & Verification

### Run the B7 Complaint Retrieval Test Suite
```bash
npm run test:retrieval
```

| Test ID | Scenario | Expected Result |
| :--- | :--- | :--- |
| **Test A** | Citizen retrieves own complaints list | `200 OK` + formatted complaints array |
| **Test B** | Citizen retrieves single complaint details | `200 OK` + timeline + resolution info |
| **Test C** | Citizen attempts to retrieve another citizen's complaint | `403 Forbidden` |
| **Test D** | Unauthenticated request to `/my` or `/:complaintId` | `401 Unauthorized` |
| **Test E** | Officer attempting to access `/my` as a citizen | `403 Forbidden` |
| **Test F** | Citizen supplies spoofed `citizen_id` query param | Ignored; returns only own complaints |
| **Test G** | Pagination behavior (`page`, `limit`) | Accurate `page`, `limit`, `total`, `total_pages` |
| **Test H** | Filter by status (`?status=...`) | Isolates matching records within citizen's complaints |
| **Test I** | Filter by department (`?department_id=...`) | Isolates matching department records |
| **Test J** | Unresolved complaint resolution value | Returns `resolution: null` |
| **Test K** | Invalid `complaintId` UUID | `422 ValidationError` |
| **Test L** | Non-existent complaint UUID | `404 Not Found` |
| **Test M** | Invalid status filter in query parameter | `422 ValidationError` |

---

### Run Full Test Suite Across All Modules

```bash
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
