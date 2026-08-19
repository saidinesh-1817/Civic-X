# CivicSense - Backend & Database Infrastructure

CivicSense is a modern civic issue reporting and resolution platform. This repository contains the backend API foundation, relational database, and role-based authentication infrastructure built with **Node.js**, **Express**, **TypeScript**, **PostgreSQL**, and **Prisma ORM**.

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
├── test_auth.ts                  # B3 Authentication & RBAC verification test suite
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
    │   ├── auth.middleware.ts    # JWT authentication, RBAC, and auth rate limiting
    │   ├── error.middleware.ts   # Centralized 404 and global error handler
    │   ├── logging.middleware.ts # HTTP request logger (colored dev / structured prod)
    │   ├── rateLimiter.middleware.ts # General security rate limiting middleware
    │   └── validate.middleware.ts # Zod-based request validation middleware
    ├── utils/
    │   ├── apiResponse.ts        # Standardized success/error JSON response utility
    │   ├── apiError.ts           # Custom operational HTTP error hierarchy
    │   └── logger.ts             # Application logger
    ├── routes/
    │   ├── index.ts              # Root /api aggregator
    │   └── v1/
    │       ├── index.ts          # Versioned /api/v1 router (mounts /auth, /health, etc.)
    │       └── health.route.ts   # Health check route
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

## 🔐 Authentication & RBAC (B3: Backend Authentication)

### 1. Authentication Method
- **Standard**: Stateless **JWT (JSON Web Tokens)** with Bearer authentication (`Authorization: Bearer <token>`).
- **Password Security**: Salted hashing with `bcryptjs` (salt rounds: 10). **Zero plaintext passwords** are stored or exposed.
- **Roles Supported**:
  - `CITIZEN`: Issue reporting, viewing personal complaints and status updates.
  - `OFFICER`: Field resolution, updating complaint status, and uploading resolution proof (requires `APPROVED` verification status).
  - `ADMIN`: System administration, approving officer registrations, and managing departments.

---

### 2. Authentication API Endpoints (`/api/v1/auth/*`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public | Citizen registration with validation, deduplication, and immediate JWT issuance |
| `POST` | `/api/v1/auth/register/officer` | Public | Field officer registration; creates profile with `PENDING` verification status |
| `POST` | `/api/v1/auth/login` | Public | Universal login for Citizens, Approved Officers, and Admins |
| `GET` | `/api/v1/auth/me` | Authenticated | Retrieves current authenticated user profile & department details |
| `POST` | `/api/v1/auth/logout` | Authenticated | Client-side logout confirmation |
| `GET` | `/api/v1/auth/test/citizen-only` | `CITIZEN` | Diagnostic route verifying Citizen RBAC authorization |
| `GET` | `/api/v1/auth/test/officer-only` | `OFFICER` | Diagnostic route verifying Approved Officer RBAC authorization |
| `GET` | `/api/v1/auth/test/admin-only` | `ADMIN` | Diagnostic route verifying Admin RBAC authorization |

---

### 3. Officer Verification Lifecycle
- When an officer registers via `/api/v1/auth/register/officer`, their account is created with `role: OFFICER` and `verification_status: PENDING`.
- **Pending/Rejected Officers cannot log in and cannot access protected officer endpoints.** Login attempts return `403 Forbidden` (`"Officer account is pending administrative approval"`).
- Only when an administrator approves the officer (`verification_status: APPROVED`) can the officer log in, receive a JWT token, and access officer workflows.

---

### 4. Development & Demo Admin Account

The project includes an administrator account created during database seeding ([`prisma/seed.ts`](file:///C:/Users/pered/.gemini/antigravity/scratch/civicsense-backend/prisma/seed.ts)):

- **Email**: `demo.admin@civicsense.local` (Configurable via `ADMIN_EMAIL` in `.env`)
- **Password**: `AdminSecure123!` (Configurable via `ADMIN_PASSWORD` in `.env`)
- **Role**: `ADMIN`

To seed or reset the admin and demo accounts:
```bash
npm run db:seed
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

---

## 🧪 Testing & Verification

### Run the B3 Authentication Test Suite
Runs tests covering all test cases (**A through J**):
```bash
npm run test:auth
```

| Test Case | Description | Expected Result |
| :--- | :--- | :--- |
| **Test A** | Citizen registration | `201 Created` + JWT token + role `CITIZEN` |
| **Test B** | Duplicate citizen registration | `409 Conflict` |
| **Test C** | Citizen login with correct password | `200 OK` + JWT token |
| **Test D** | Citizen login with wrong password | `401 Unauthorized` |
| **Test E** | Officer registration | `201 Created` + status `PENDING` |
| **Test F** | Pending officer login | `403 Forbidden` (Approval required) |
| **Test G** | Approved officer login | `200 OK` + token & department metadata |
| **Test H** | `GET /auth/me` with valid token | `200 OK` + safe user profile |
| **Test I** | `GET /auth/me` without token | `401 Unauthorized` |
| **Test J** | Wrong role accessing protected endpoint | `403 Forbidden` (RBAC enforced) |

### Run Database Integrity Checks
```bash
npm run test:db
```

### Run TypeScript Checks & Build
```bash
npm run lint
npm run build
```

---

## 📖 Manual API Testing Guide (curl & PowerShell)

### 1. Citizen Registration
```bash
# Using curl:
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Citizen",
    "email": "jane@example.com",
    "phone": "+91-9876543210",
    "password": "Password123!"
  }'
```

### 2. Citizen / Officer / Admin Login
```bash
# Using curl:
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo.admin@civicsense.local",
    "password": "AdminSecure123!"
  }'
```

### 3. Get Current User Profile (`/auth/me`)
```bash
# Using curl:
curl http://localhost:5000/api/v1/auth/me \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>"
```
