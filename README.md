# CivicSense - Backend & Database Infrastructure

CivicSense is a modern civic issue reporting and resolution platform. This repository contains the backend API foundation and relational database infrastructure built with **Node.js**, **Express**, **TypeScript**, **PostgreSQL**, and **Prisma ORM**.

---

## 🏗️ Project Architecture & Structure

The codebase is organized modularly to enable clean separation of concerns:

```
civicsense-backend/
├── .env.example                  # Template for environment variables
├── .env                          # Local environment settings (gitignored)
├── .gitignore                    # Git ignore file
├── package.json                  # Project dependencies & scripts
├── tsconfig.json                 # Strict TypeScript configuration
├── test_endpoints.js             # HTTP API endpoint verification script
├── test_database.ts              # Database schema & integrity verification suite
├── README.md                     # Documentation
├── prisma/
│   ├── schema.prisma             # PostgreSQL schema definition & models
│   ├── seed.ts                   # Comprehensive database seed script
│   └── migrations/
│       └── 20260819000000_init/  # SQL DDL migration files
│           └── migration.sql
└── src/
    ├── server.ts                 # Server entrypoint with graceful shutdown & signal traps
    ├── app.ts                    # Express application factory, security middlewares & routing
    ├── config/
    │   ├── env.config.ts         # Type-safe environment variable parsing & defaults
    │   ├── cors.config.ts        # CORS configuration for frontend applications
    │   └── database.ts           # Singleton Prisma Client & connection lifecycle
    ├── middlewares/
    │   ├── error.middleware.ts   # Centralized 404 and global error handler
    │   ├── logging.middleware.ts # HTTP request logger (colored dev / structured prod)
    │   ├── rateLimiter.middleware.ts # Security rate limiting middleware
    │   └── validate.middleware.ts # Zod-based request validation middleware
    ├── utils/
    │   ├── apiResponse.ts        # Standardized success/error JSON response utility
    │   ├── apiError.ts           # Custom operational HTTP error hierarchy
    │   └── logger.ts             # Application logger
    ├── routes/
    │   ├── index.ts              # Root /api aggregator
    │   └── v1/
    │       ├── index.ts          # Versioned /api/v1 router
    │       └── health.route.ts   # Health check route
    └── modules/                  # Domain module placeholders for subsequent phases
        ├── auth/                 # Future: Citizen & staff authentication / RBAC
        ├── users/                # Future: Citizen profiles & preferences
        ├── departments/          # Future: Civic departments & SLAs
        ├── complaints/           # Future: Issue reporting, tracking & resolution workflows
        ├── notifications/        # Future: Multi-channel notifications (Push, SMS, Email)
        ├── officers/             # Future: Field officer assignments & management
        └── administration/       # Future: Administrative controls, wards & metrics
```

---

## 🗄️ Database Architecture (B2: Database Foundation)

### Database Technology
- **Database Engine**: PostgreSQL (14+)
- **ORM & Migrations**: Prisma ORM (`@prisma/client`, `prisma`)
- **Primary Keys**: UUID v4 (`@id @default(uuid()) @db.Uuid`)
- **Security**: Passwords securely hashed with `bcryptjs` (never stored in plaintext)

### Core Entities & Relationships

| Entity | Table Name | Description | Key Relationships |
| :--- | :--- | :--- | :--- |
| **User** | `users` | Citizens, Officers, Admins | 1:1 with `OfficerProfile`, 1:M with `Complaint`, 1:M with `Notification` |
| **Department** | `departments` | 10 core civic departments | 1:M with `OfficerProfile`, 1:M with `DepartmentOffice`, 1:M with `Complaint` |
| **OfficerProfile** | `officer_profiles` | Field officer credentials & verification | 1:1 with `User`, M:1 with `Department`, 1:M with `ComplaintAssignment`, 1:M with `Resolution` |
| **DepartmentOffice** | `department_offices` | Geographical department offices | M:1 with `Department`, 1:M with `Complaint` |
| **Complaint** | `complaints` | Civic issues filed by citizens | M:1 with `User` (citizen), M:1 with `Department`, M:1 with `DepartmentOffice` (optional), 1:M `ComplaintAssignment`, 1:M `ComplaintStatusHistory`, 1:1 `Resolution` |
| **ComplaintAssignment**| `complaint_assignments` | Assignment of complaints to officers | M:1 with `Complaint`, M:1 with `OfficerProfile`, M:1 with `User` (assigner) |
| **ComplaintStatusHistory** | `complaint_status_history` | Traceable status change audit log | M:1 with `Complaint`, M:1 with `User` (changer) |
| **Resolution** | `resolutions` | Officer resolution notes and photo proof | 1:1 with `Complaint`, M:1 with `OfficerProfile` |
| **Notification** | `notifications` | In-app user notifications | M:1 with `User` (recipient), M:1 with `Complaint` (optional) |

### Enums
- **`Role`**: `CITIZEN`, `OFFICER`, `ADMIN`
- **`VerificationStatus`**: `PENDING`, `APPROVED`, `REJECTED`
- **`Priority`**: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
- **`ComplaintStatus`**: `NEW`, `ASSIGNED`, `IN_PROGRESS`, `RESOLVED`

### Core Department List (Seeded)
1. Municipality / Sanitation
2. Roads & Infrastructure
3. Water Supply
4. Electricity
5. Traffic
6. Public Health
7. Environment / Parks
8. Fire & Emergency
9. Public Transport
10. Housing / Building Issues

---

## ⚙️ Prerequisites

- **Node.js**: v18.0.0 or higher (v22+ recommended)
- **npm**: v9.0.0 or higher
- **PostgreSQL**: v14.0 or higher (or Docker)

---

## 🚀 Database Setup & Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
# Windows PowerShell
Copy-Item .env.example .env

# Linux / macOS / Git Bash
cp .env.example .env
```

Adjust the database connection URL in `.env`:

```env
# PostgreSQL connection string
# Format: postgresql://[user]:[password]@[host]:[port]/[database]?schema=[schema]
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/civicsense?schema=public"
```

### 3. Generate Prisma Client

```bash
npm run db:generate
```

### 4. Run Migrations

To apply database migrations to your PostgreSQL instance:

```bash
# In Development (applies migrations and updates schema)
npm run db:migrate

# In Production / CI (applies pending migrations)
npm run db:deploy
```

### 5. Seed the Database

Populate the database with the 10 core departments, demo offices, demo users (hashed passwords), officer profiles, and sample complaints:

```bash
npm run db:seed
```

### 6. Reset the Development Database

To completely wipe and recreate the database with migrations and seeds:

```bash
npm run db:reset
```

### 7. View Database with Prisma Studio

To inspect database records interactively in your browser:

```bash
npm run db:studio
```

---

## 🧪 Database & API Verification

### Verify Database Integrity & Models

Run the automated database test suite:

```bash
npm run test:db
```

This verifies:
- Schema definitions, enums, models, and relations
- PostgreSQL DDL migration syntax and foreign key integrity
- Seed department completeness and demo data structures
- Zero plaintext passwords (all user passwords validated as bcrypt hashes)
- Live database queries and foreign-key constraints (when database is online)

### Verify API Server & Health Check

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Run the HTTP endpoint test script:
   ```bash
   npm test
   ```

3. Manual Health Check:
   ```bash
   # Using curl
   curl http://localhost:5000/api/health

   # Using PowerShell
   Invoke-RestMethod -Uri "http://localhost:5000/api/health" -Method Get
   ```

---

## 🔐 Security & Password Policy

- **No Plaintext Passwords**: User passwords must always be salted and hashed with `bcryptjs` or standard hashing before storing in the database.
- **Foreign Key Constraints**: Cascading deletes are enforced on user profiles/notifications; strict restrict rules prevent orphaned complaints or departments.
- **Graceful Shutdown**: The server gracefully closes database connection pools on `SIGINT` / `SIGTERM` signals.
