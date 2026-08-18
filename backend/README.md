# CivicSense - Backend Foundation (API Service)

CivicSense is a modern civic issue reporting and resolution platform. This repository contains the backend foundation and API infrastructure built with **Node.js**, **Express**, and **TypeScript**.

---

## 🏗️ Project Architecture & Structure

The codebase is organized modularly to enable clean separation of concerns and seamless integration of future domain services:

```
civicsense-backend/
├── .env.example                  # Template for environment variables
├── .env                          # Local environment settings (gitignored)
├── .gitignore                    # Git ignore file
├── package.json                  # Project dependencies & scripts
├── tsconfig.json                 # Strict TypeScript configuration
├── README.md                     # Documentation
└── src/
    ├── server.ts                 # Server entrypoint with graceful shutdown & signal traps
    ├── app.ts                    # Express application factory, security middlewares & routing
    ├── config/
    │   ├── env.config.ts         # Type-safe environment variable parsing & defaults
    │   └── cors.config.ts        # CORS configuration for frontend applications
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
    │       ├── index.ts          # Versioned /api/v1 router (future module mount points)
    │       └── health.route.ts   # Health check route
    └── modules/                  # Domain module placeholders for subsequent development phases
        ├── auth/                 # Future: Citizen & staff authentication / RBAC
        ├── users/                # Future: Citizen profiles & preferences
        ├── departments/          # Future: Civic departments & SLAs
        ├── complaints/           # Future: Issue reporting, tracking & resolution workflows
        ├── notifications/        # Future: Multi-channel notifications (Push, SMS, Email)
        ├── officers/             # Future: Field officer assignments & management
        └── administration/       # Future: Administrative controls, wards & metrics
```

---

## ⚙️ Prerequisites

- **Node.js**: v18.0.0 or higher (v22+ recommended)
- **npm**: v9.0.0 or higher

---

## 🚀 Getting Started

### 1. Install Dependencies

In the project root directory, install all required dependencies:

```bash
npm install
```

### 2. Configure Environment Variables

Create a local `.env` file by copying the template:

```bash
# On Linux / macOS / Git Bash
cp .env.example .env

# On Windows PowerShell
Copy-Item .env.example .env
```

Review and adjust the environment variables as needed:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | Runtime environment (`development`, `production`, `test`) |
| `PORT` | `5000` | Port number on which the HTTP server listens |
| `API_PREFIX` | `/api` | Base path prefix for all API endpoints |
| `CORS_ORIGIN` | `http://localhost:3000,http://localhost:5173` | Allowed frontend origins (comma-separated or `*`) |
| `RATE_LIMIT_WINDOW_MINUTES` | `15` | Rate limiting sliding window in minutes |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Maximum requests allowed per window per IP |

### 3. Run the Development Server

Start the server in hot-reload development mode:

```bash
npm run dev
```

The server will initialize on `http://localhost:5000`.

### 4. Build & Run for Production

Compile TypeScript to JavaScript in the `dist` directory and start the production server:

```bash
# Build the project
npm run build

# Start the compiled production build
npm start
```

---

## 🩺 Testing the Health Check Endpoint

Once the server is running, you can test the health check endpoint using `curl`, PowerShell, or your browser:

### Using curl:

```bash
curl http://localhost:5000/api/health
```

### Using PowerShell:

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/health" -Method Get
```

### Expected Response (`200 OK`):

```json
{
  "status": "ok",
  "service": "CivicSense API"
}
```

The versioned endpoint is also accessible at:
```
GET /api/v1/health
```

---

## 🛡️ Security & Middleware Features

- **Helmet**: Secures HTTP response headers against common vulnerabilities.
- **CORS**: Granular cross-origin resource sharing allowing decoupled React/Vue/Mobile frontends.
- **Rate Limiting**: Defends endpoints against brute-force attacks and abuse.
- **Centralized Error Handling**: Captures synchronous and asynchronous errors, formatting consistent JSON error responses without leaking stack traces in production.
- **Request Logging**: Development-friendly colored request logging and production-ready access logs.
- **Graceful Shutdown**: Intercepts `SIGINT` / `SIGTERM` signals to close active connections cleanly without dropping requests.
