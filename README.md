# CivicSense - Backend & Database Infrastructure

CivicSense is a modern civic issue reporting and resolution platform. This repository contains the backend API foundation, relational database, role-based authentication, department-based authorization, department/office management, and complaint creation infrastructure built with **Node.js**, **Express**, **TypeScript**, **PostgreSQL**, and **Prisma ORM**.

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
        ├── complaints/           # B6: Complaint Creation & Submission
        │   ├── complaints.controller.ts  # Complaint HTTP handlers
        │   ├── complaints.service.ts     # Complaint lifecycle, auto-routing & tracking logic
        │   ├── complaints.schema.ts      # Zod complaint submission schemas
        │   └── complaints.route.ts       # /api/v1/complaints router definitions
        ├── users/                # Future: Citizen profiles & preferences
        ├── notifications/        # Future: Multi-channel notifications (Push, SMS, Email)
        ├── officers/             # Future: Field officer assignments & management
        └── administration/       # Future: Administrative controls, wards & metrics
```

---

## 📝 Complaint Creation & Submission (B6)

### 1. Complaint Submission Flow

```
[Authenticated Citizen]
       │
       ▼  POST /api/v1/complaints (with title, description, department_id, GPS, photo)
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Validate Citizen Session (req.user.id, role = CITIZEN)                   │
│ 2. Validate Department (active = true)                                      │
│ 3. Validate & Store Photo (Magic byte inspection, safe unique filename)     │
│ 4. Automatic Spatial Routing: Haversine distance -> nearest department office│
│ 5. Atomic DB Transaction:                                                   │
│    • Complaint created with default status = 'NEW', priority = 'MEDIUM'     │
│    • Initial ComplaintStatusHistory created (changed_by = citizen.id)       │
│ 6. Generate human-readable identifier (CIV-######)                          │
└─────────────────────────────────────────────────────────────────────────────┘
       │
       ▼  201 Created
[Safe Formatted Complaint Response with tracking number]
```

---

### 2. Endpoints Specification

| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/complaints` | `CITIZEN` | Submit a new civic issue report. |

#### Request Body (`application/json`):
```json
{
  "title": "Overflowing Garbage Bin on 4th Cross",
  "description": "Community garbage bin has not been cleared for 3 days and is overflowing onto the street.",
  "department_id": "11111111-1111-1111-1111-111111111111",
  "latitude": 12.9810,
  "longitude": 77.6320,
  "photo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ..."
}
```

#### Successful Response (`201 Created`):
```json
{
  "success": true,
  "message": "Complaint registered successfully",
  "data": {
    "id": "c0000000-0000-0000-0000-000000000001",
    "complaint_number": "CIV-100001",
    "title": "Overflowing Garbage Bin on 4th Cross",
    "description": "Community garbage bin has not been cleared for 3 days and is overflowing onto the street.",
    "photo_url": "/uploads/complaints/complaints_1787305809782_3a8ecb7a32f69dba.png",
    "latitude": 12.981,
    "longitude": 77.632,
    "priority": "MEDIUM",
    "status": "NEW",
    "department": {
      "id": "11111111-1111-1111-1111-111111111111",
      "name": "Municipality / Sanitation",
      "description": "Solid waste management & sanitation"
    },
    "office": {
      "id": "aaaa2222-2222-2222-2222-222222222222",
      "name": "East Ward Sanitation Office",
      "address": "Building B, Indiranagar East",
      "latitude": 12.981,
      "longitude": 77.632
    },
    "citizen": {
      "id": "user-cit-1111",
      "name": "Jane Citizen",
      "email": "jane.citizen@civicsense.local"
    },
    "created_at": "2026-08-21T09:50:09.000Z"
  }
}
```

---

### 3. Security & Anti-Spoofing Guarantees

1. **`citizen_id` Zero Trust**: Sourced strictly from authenticated session token (`req.user.id`). Client attempts to submit `citizen_id` are completely ignored.
2. **Lifecycle Defaults**: `status` is hardcoded to `NEW`; `priority` is hardcoded to `MEDIUM`. Frontend attempts to submit spoofed status or priority values are stripped.
3. **Role Enforcement**: Only users with `role = CITIZEN` can create complaints (`403 Forbidden` for Officers or unapproved accounts).
4. **Photo Validation**: Image uploads are inspected for valid magic bytes (`JPEG`, `PNG`, `WEBP`, `GIF`) to prevent file-type spoofing or executable payload uploads. Size is capped at 5 MB.
5. **Geographic Boundaries**: Latitudes outside \([-90, 90]\) and longitudes outside \([-180, 180]\) are rejected with `422 ValidationError`.

---

## 🧪 Testing & Verification

### Run the B6 Complaint Creation Test Suite
```bash
npm run test:complaints
```

| Test ID | Scenario | Expected Result |
| :--- | :--- | :--- |
| **S1** | Photo storage & unique filename generation | Safe URL reference generated under `/uploads/complaints/` |
| **S2** | Reject spoofed / malicious image headers | `400 BadRequestError` |
| **S3** | Deterministic human-readable identifier format | `CIV-######` format verified |
| **Test A** | Authenticated citizen submits valid complaint | `201 Created` |
| **Test B** | Citizen submits valid photo | Photo stored & referenced in `photo_url` |
| **Test C** | Citizen submits GPS coordinates | Geolocation persisted |
| **Test D** | Department selection | Correct department association stored |
| **Test E** | Nearest office exists | `office_id` automatically resolved via Haversine and stored |
| **Test F** | Department without active offices | Complaint created with `office_id = null` |
| **Test G** | Unauthenticated user | `401 Unauthorized` |
| **Test H** | Officer attempts to create citizen complaint | `403 Forbidden` |
| **Test I** | Inactive or non-existent department | `404 Not Found` |
| **Test J** | Out-of-bounds latitude/longitude | `422 ValidationError` |
| **Test K** | Invalid / corrupt image data | `400 BadRequestError` |
| **Test L** | Client attempts to inject `citizen_id`, `priority`, or `status` | Ignored; server session and defaults enforced |
| **Test M** | Initial complaint status | Hardcoded to `NEW` |
| **Test N** | Initial `ComplaintStatusHistory` record | Logged with `status = NEW` & `changed_by = citizen.id` |
| **Test O** | Unique `CIV-...` human-readable complaint ID | Generated and exposed in API response |

---

### Run Full Test Suite Across All Modules

```bash
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
