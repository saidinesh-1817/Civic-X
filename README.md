# CivicSense - Backend & Database Infrastructure

CivicSense is a modern civic issue reporting and resolution platform. This repository contains the backend API foundation, relational database, role-based authentication, department-based authorization, and department/office management infrastructure built with **Node.js**, **Express**, **TypeScript**, **PostgreSQL**, and **Prisma ORM**.

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
    │   ├── geo.ts                # Geodesic & Haversine distance calculation utilities
    │   ├── apiResponse.ts        # Standardized success/error JSON response utility
    │   ├── apiError.ts           # Custom operational HTTP error hierarchy
    │   └── logger.ts             # Application logger
    ├── routes/
    │   ├── index.ts              # Root /api aggregator
    │   └── v1/
    │       ├── index.ts          # Versioned /api/v1 router (mounts /auth, /departments, /offices, /test)
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
        ├── users/                # Future: Citizen profiles & preferences
        ├── complaints/           # Future: Issue reporting, tracking & resolution workflows
        ├── notifications/        # Future: Multi-channel notifications (Push, SMS, Email)
        ├── officers/             # Future: Field officer assignments & management
        └── administration/       # Future: Administrative controls, wards & metrics
```

---

## 🏢 Departments & Office System (B5)

### 1. The 10 Core Civic Departments

CivicSense categorizes municipal and urban civic issues under 10 standardized departments:

1. **Municipality / Sanitation** — Solid waste management, garbage clearance, drain cleaning, and street sweeping.
2. **Roads & Infrastructure** — Pothole repair, road resurfacing, footpath maintenance, and bridge safety.
3. **Water Supply** — Potable water distribution, pipeline leak repairs, and water contamination.
4. **Electricity** — Streetlight faults, power outages, damaged electrical poles, and exposed wiring.
5. **Traffic** — Traffic signal synchronization, road signages, zebra crossings, and congestion management.
6. **Public Health** — Vector control, disease prevention, public toilet hygiene, and medical clinic monitoring.
7. **Environment / Parks** — Public parks, tree pruning, pollution checks, and urban greenery preservation.
8. **Fire & Emergency** — Fire hazard reporting, safety compliance, hydrant checks, and emergency preparedness.
9. **Public Transport** — Bus stop maintenance, commuter facilities, and transit terminal upkeep.
10. **Housing / Building Issues** — Unauthorized construction alerts, building safety violations, and zoning compliance.

---

### 2. Department & Office Relational Hierarchy

```
┌────────────────────────────────────────────────────────┐
│                   DEPARTMENT                           │
│   (id, name, description, active, created_at, ...)     │
└──────────────────────────┬─────────────────────────────┘
                           │ 1-to-Many
                           ▼
┌────────────────────────────────────────────────────────┐
│                DEPARTMENT OFFICE                       │
│   (id, department_id, name, address,                   │
│    latitude, longitude, active, created_at, ...)       │
└────────────────────────────────────────────────────────┘
```

- Each department can have multiple regional/ward offices.
- Each office contains precise GPS coordinates (`latitude`, `longitude`) used for spatial routing.
- Immutability rule: Once created, an office cannot have its `department_id` modified by client requests.

---

### 3. Department & Office API Endpoints

#### Public / Authenticated Read Endpoints:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/departments` | Lists all active civic departments formatted for frontend selection. |
| `GET` | `/api/v1/departments/:departmentId` | Retrieves a single active department by UUID. |
| `GET` | `/api/v1/departments/:departmentId/offices` | Retrieves all active offices belonging to the specified department. |
| `GET` | `/api/v1/departments/:departmentId/nearest-office` | Calculates the closest department office to supplied GPS coordinates (`?latitude=...&longitude=...`). |
| `GET` | `/api/v1/offices/:officeId` | Retrieves an individual office by UUID including its department metadata. |

#### Administrative Modification Endpoints (`ADMIN` Only):

| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/departments` | `ADMIN` | Create a new department. |
| `PATCH` | `/api/v1/departments/:departmentId` | `ADMIN` | Update department name, description, or active status. |
| `POST` | `/api/v1/departments/:departmentId/offices` | `ADMIN` | Create a new office under a department. |
| `PATCH` | `/api/v1/offices/:officeId` | `ADMIN` | Update office details (`name`, `address`, `latitude`, `longitude`, `active`). |
| `DELETE` | `/api/v1/offices/:officeId` | `ADMIN` | Deactivate an office (`active = false`). |

---

### 4. Nearest-Office Calculation (Haversine Distance)

When citizens report issues with GPS coordinates, CivicSense automatically routes complaints to the nearest office of the relevant department using the **Haversine Geodesic Distance Formula**:

$$\Delta\text{lat} = \frac{(\text{lat}_2 - \text{lat}_1) \cdot \pi}{180}, \quad \Delta\text{lon} = \frac{(\text{lon}_2 - \text{lon}_1) \cdot \pi}{180}$$
$$a = \sin^2\left(\frac{\Delta\text{lat}}{2}\right) + \cos\left(\frac{\text{lat}_1 \cdot \pi}{180}\right) \cdot \cos\left(\frac{\text{lat}_2 \cdot \pi}{180}\right) \cdot \sin^2\left(\frac{\Delta\text{lon}}{2}\right)$$
$$c = 2 \cdot \text{atan2}\left(\sqrt{a}, \sqrt{1 - a}\right)$$
$$d = R \cdot c \quad (\text{where } R = 6,371 \text{ km})$$

#### Programmatic Usage in Services / Controllers:
```typescript
import { DepartmentsService } from './modules/departments/departments.service.js';

// Calculate closest office for complaint routing:
const result = await DepartmentsService.findNearestDepartmentOffice(
  departmentId,
  12.9784, // latitude
  77.6408  // longitude
);

console.log(result.office.name); // e.g. "East Ward Sanitation Office"
console.log(result.distanceKm);  // e.g. 1.02 km
```

---

### 5. Example API Requests & Responses

#### A. List Active Departments
```bash
curl http://localhost:5000/api/v1/departments
```
**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "11111111-1111-1111-1111-111111111111",
      "name": "Municipality / Sanitation",
      "description": "Solid waste management, garbage clearance, drain cleaning...",
      "active": true,
      "officeCount": 2,
      "officerCount": 1,
      "createdAt": "2026-08-21T00:00:00.000Z"
    }
  ],
  "message": "Active departments retrieved successfully"
}
```

#### B. Find Nearest Office
```bash
curl "http://localhost:5000/api/v1/departments/11111111-1111-1111-1111-111111111111/nearest-office?latitude=12.9784&longitude=77.6408"
```
**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "office": {
      "id": "aaaa2222-2222-2222-2222-222222222222",
      "department_id": "11111111-1111-1111-1111-111111111111",
      "name": "East Ward Sanitation Office",
      "address": "Building B, 8th Cross, Indiranagar East",
      "latitude": 12.981,
      "longitude": 77.632,
      "active": true
    },
    "department": {
      "id": "11111111-1111-1111-1111-111111111111",
      "name": "Municipality / Sanitation"
    },
    "distanceKm": 1.02,
    "distanceMeters": 1020,
    "queriedCoordinates": {
      "latitude": 12.9784,
      "longitude": 77.6408
    }
  },
  "message": "Nearest department office calculated successfully"
}
```

---

## 🧪 Testing & Verification

### Run the B5 Department & Office Test Suite
```bash
npm run test:departments
```

| Test ID | Scenario | Expected Result |
| :--- | :--- | :--- |
| **GEO-1** | Haversine distance accuracy | Distance within ±0.1 km of known geodesic reference |
| **GEO-2** | Coordinate boundary validation | Validates \([-90..90]\) lat and \([-180..180]\) lon |
| **Test A** | Get all departments | `200 OK` + array of 10 active departments |
| **Test B** | Get active department by ID | `200 OK` + department details |
| **Test C** | Invalid department ID / non-existent | `422 ValidationError` for malformed UUID; `404 Not Found` for non-existent |
| **Test D** | Get offices for department | `200 OK` + active offices list |
| **Test E** | Invalid department office query | `404 Not Found` |
| **Test F** | Get specific office by ID | `200 OK` + office and department metadata |
| **Test G** | Nearest-office calculation | `200 OK` + closest office identified with exact distance |
| **Test H** | Out-of-bounds latitude/longitude | `422 ValidationError` |
| **Test I** | Unauthorized modification (Citizen/Officer) | `401 Unauthorized` / `403 Forbidden` |
| **Test J** | Admin modification (Create/Update) | `201 Created` / `200 OK` |

---

### Run Full Test Suite Across All Modules

```bash
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
