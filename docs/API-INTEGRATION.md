# CivicSense — Frontend API Integration Guide

This guide is for frontend and mobile engineers (e.g. building in Lovable, React, Vue, Flutter, iOS/Android) integrating with the **CivicSense REST API Backend**.

---

## 1. Quick Start & Connection Details

- **Base API URL (v1)**: `http://localhost:5000/api/v1` (or your staging/production host)
- **Health Check Probes**:
  - `GET /health`
  - `GET /api/health`
  - `GET /api/v1/health`
- **Static Upload Assets**: `http://localhost:5000/uploads/...`
- **CORS Configuration**: By default accepts requests from `http://localhost:3000` and `http://localhost:5173`. Configured via `FRONTEND_URL` / `CORS_ORIGIN` environment variables.

---

## 2. Authentication & Headers

All authenticated endpoints require an `Authorization` header containing the JWT token received upon login or registration:

```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Standard User Roles:
- `CITIZEN`: Default citizen accounts. Can register, create complaints, track own complaints, receive in-app notifications.
- `OFFICER`: Field officers. Registered under a specific municipal department. Requires `APPROVED` verification status by an administrator before accessing protected officer tools.
- `ADMIN`: Platform municipal administrators. Manages officer approvals, department assignments, and views municipal complaint summary metrics.

---

## 3. Standard Response Formats

### Standard Success Response (`200 OK` / `201 Created`):
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### Standard Success Response with Pagination:
```json
{
  "success": true,
  "message": "Complaints retrieved successfully",
  "data": {
    "complaints": [ ... ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 42,
      "total_pages": 3
    }
  }
}
```

### Standard Error Response:
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    {
      "field": "title",
      "message": "Title must be at least 5 characters long"
    }
  ]
}
```

#### HTTP Status Codes:
- `200 OK`: Request succeeded.
- `201 Created`: Resource successfully created.
- `400 Bad Request`: Invalid payload or disallowed status transition.
- `401 Unauthorized`: Missing or invalid JWT authentication token.
- `403 Forbidden`: Insufficient role, unapproved officer, cross-department access, or accessing another user's private resource.
- `404 Not Found`: Resource does not exist.
- `409 Conflict`: Unique constraint collision (e.g. email already in use).
- `422 Unprocessable Entity`: Input schema validation failure.
- `429 Too Many Requests`: Rate limit threshold exceeded.
- `500 Internal Server Error`: Unexpected server issue (stack trace stripped in production).

---

## 4. Complete API Inventory

### 🔐 Authentication Module (`/api/v1/auth/*`)

#### 1. Register Citizen (`POST /api/v1/auth/register`)
- **Role**: Public
- **Request Body**:
```json
{
  "name": "Ananya Sharma",
  "email": "ananya@example.com",
  "phone": "+91-9876543210",
  "password": "Password123!"
}
```
- **Response (`201 Created`)**:
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "c0000001-0001-4001-8001-000000000001",
      "name": "Ananya Sharma",
      "email": "ananya@example.com",
      "phone": "+91-9876543210",
      "role": "CITIZEN"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI..."
  }
}
```

#### 2. Register Officer (`POST /api/v1/auth/register-officer`)
- **Role**: Public
- **Request Body**:
```json
{
  "name": "Rajesh Kumar",
  "email": "rajesh.officer@civicsense.local",
  "phone": "+91-9888888888",
  "password": "OfficerSecure123!",
  "department_id": "11111111-1111-1111-1111-111111111111",
  "designation": "Sanitation Inspector"
}
```
- **Note**: The officer is registered with `verification_status: "PENDING"` and must be approved by an admin before accessing officer features.

#### 3. Login (`POST /api/v1/auth/login`)
- **Role**: Public
- **Request Body**:
```json
{
  "email": "ananya@example.com",
  "password": "Password123!"
}
```
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "c0000001-0001-4001-8001-000000000001",
      "name": "Ananya Sharma",
      "email": "ananya@example.com",
      "role": "CITIZEN"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI..."
  }
}
```

#### 4. Current User Profile (`GET /api/v1/auth/me`)
- **Role**: Authenticated User
- **Response (`200 OK`)**: Returns profile object (including `officer_profile` with department and status if Officer). Passwords are never returned.

---

### 🏛️ Departments & Offices (`/api/v1/departments/*`, `/api/v1/offices/*`)

#### 1. List Active Departments (`GET /api/v1/departments`)
- **Role**: Public
- **Response (`200 OK`)**: Array of active municipal departments with descriptions.

#### 2. Get Department Details (`GET /api/v1/departments/:departmentId`)
- **Role**: Public

#### 3. List Department Offices (`GET /api/v1/departments/:departmentId/offices`)
- **Role**: Public
- **Response (`200 OK`)**: Offices under that department with GPS coordinates and addresses.

#### 4. Get Office Details (`GET /api/v1/offices/:officeId`)
- **Role**: Public

---

### 📢 Citizen Complaints (`/api/v1/complaints/*`)

#### 1. Submit Complaint (`POST /api/v1/complaints`)
- **Role**: `CITIZEN`
- **Request Body**:
```json
{
  "title": "Severe Sewage Overflow",
  "description": "Blackwater leaking onto street near bus stand for 3 days.",
  "department_id": "11111111-1111-1111-1111-111111111111",
  "photo": "data:image/jpeg;base64,...",
  "latitude": 12.9718,
  "longitude": 77.5947
}
```
- **Photo Upload Format**: Standard base64 string or Data URI (`data:image/png;base64,...`). Max size: 5MB. Formats: JPEG, PNG, WEBP, GIF.
- **Location Processing**: Backend validates coordinates and automatically maps the complaint to the nearest active municipal office of the selected department via Haversine calculation.
- **Response (`201 Created`)**:
```json
{
  "success": true,
  "message": "Complaint registered successfully",
  "data": {
    "id": "complaint-uuid",
    "complaint_number": "CIV-428889",
    "title": "Severe Sewage Overflow",
    "description": "...",
    "status": "NEW",
    "priority": "MEDIUM",
    "photo_url": "/uploads/complaints/complaints_1787466259293_4768ce13d7998d27.png",
    "latitude": 12.9718,
    "longitude": 77.5947,
    "department": { "id": "...", "name": "Municipality / Sanitation" },
    "office": { "id": "...", "name": "Sanitation Central Division", "address": "..." },
    "status_history": [
      {
        "status": "NEW",
        "note": "Complaint registered by citizen.",
        "created_at": "2026-08-23T11:00:00.000Z"
      }
    ],
    "resolution": null
  }
}
```

#### 2. List Citizen's Own Complaints (`GET /api/v1/complaints/my`)
- **Role**: `CITIZEN`
- **Query Params**: `?page=1&limit=20&status=NEW`
- **Response (`200 OK`)**: Paginated list of complaints filed by the authenticated citizen.

#### 3. View Complaint Details (`GET /api/v1/complaints/:complaintId`)
- **Role**: Authenticated User (Owner Citizen, Assigned Officer, or Admin)
- **Response (`200 OK`)**: Full detail including complete `status_history` timeline and `resolution` object (if resolved).

---

### 👮 Field Officer Workflow (`/api/v1/officer/*`)

#### 1. List Department Complaints (`GET /api/v1/officer/complaints`)
- **Role**: `APPROVED OFFICER`
- **Query Params**: `?page=1&limit=20&status=NEW&priority=HIGH`
- **Response (`200 OK`)**: Complaints strictly belonging to the officer's assigned department.

#### 2. Accept Complaint (`POST /api/v1/officer/complaints/:complaintId/assign`)
- **Role**: `APPROVED OFFICER` (Must belong to complaint's department)
- **Allowed Transition**: `NEW` $\rightarrow$ `ASSIGNED`
- **Request Body**:
```json
{
  "action": "ACCEPT",
  "note": "Officer taking charge for site inspection."
}
```
- **Response (`200 OK`)**: Transitions status to `ASSIGNED` and logs assignment.

#### 3. Start Work on Complaint (`PATCH /api/v1/officer/complaints/:complaintId/status`)
- **Role**: `APPROVED OFFICER` (Must be assigned to complaint)
- **Allowed Transition**: `ASSIGNED` $\rightarrow$ `IN_PROGRESS`
- **Request Body**:
```json
{
  "status": "IN_PROGRESS",
  "note": "Field repair team dispatched."
}
```
- **Response (`200 OK`)**: Transitions status to `IN_PROGRESS`.

#### 4. Resolve Complaint with Evidence (`POST /api/v1/officer/complaints/:complaintId/resolve`)
- **Role**: `APPROVED OFFICER` (Must be assigned to complaint)
- **Allowed Transition**: `IN_PROGRESS` $\rightarrow$ `RESOLVED`
- **Request Body**:
```json
{
  "note": "Sewage blockage removed, pipeline cleaned and disinfected.",
  "photo": "data:image/jpeg;base64,..."
}
```
- **Response (`200 OK`)**: Transitions status to `RESOLVED`, stores resolution evidence photo, and creates `resolution` record.

---

### 🔔 In-App Notifications (`/api/v1/notifications/*`)

#### 1. List User Notifications (`GET /api/v1/notifications`)
- **Role**: Authenticated User
- **Query Params**: `?page=1&limit=20&is_read=false`
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Notifications retrieved successfully",
  "data": {
    "notifications": [
      {
        "id": "notif-uuid",
        "recipient_user_id": "user-uuid",
        "complaint_id": "complaint-uuid",
        "title": "Complaint Resolved",
        "message": "Your complaint CIV-428889 has been resolved.",
        "type": "COMPLAINT_RESOLVED",
        "is_read": false,
        "created_at": "2026-08-23T11:20:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "total_pages": 1 }
  }
}
```

#### 2. Get Unread Count (`GET /api/v1/notifications/unread-count`)
- **Role**: Authenticated User
- **Response (`200 OK`)**: `{ "data": { "count": 3 } }`

#### 3. Mark Single Notification Read (`PATCH /api/v1/notifications/:notificationId/read`)
- **Role**: Authenticated User (Owner only)

#### 4. Mark All Read (`PATCH /api/v1/notifications/read-all`)
- **Role**: Authenticated User

---

### 🛡️ Administration (`/api/v1/admin/*`)

#### 1. List Officer Registrations (`GET /api/v1/admin/officers`)
- **Role**: `ADMIN`
- **Query Params**: `?page=1&limit=20&verification_status=PENDING`

#### 2. Get Officer Details (`GET /api/v1/admin/officers/:officerId`)
- **Role**: `ADMIN`

#### 3. Approve Officer (`PATCH /api/v1/admin/officers/:officerId/approve`)
- **Role**: `ADMIN`
- Sets `verification_status = APPROVED` and sends in-app approval alert.

#### 4. Reject Officer (`PATCH /api/v1/admin/officers/:officerId/reject`)
- **Role**: `ADMIN`
- **Request Body**: `{ "reason": "Could not verify employee ID credentials." }`

#### 5. Assign/Change Department (`PATCH /api/v1/admin/officers/:officerId/department`)
- **Role**: `ADMIN`
- **Request Body**: `{ "department_id": "22222222-2222-2222-2222-222222222222" }`

#### 6. Department Officers (`GET /api/v1/admin/departments/:departmentId/officers`)
- **Role**: `ADMIN`

#### 7. Complaints Summary Metrics (`GET /api/v1/admin/complaints/summary`)
- **Role**: `ADMIN`
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Complaints summary retrieved successfully",
  "data": {
    "total_complaints": 42,
    "by_status": {
      "new": 10,
      "assigned": 12,
      "in_progress": 14,
      "resolved": 6
    },
    "by_department": [
      {
        "department_id": "11111111-1111-1111-1111-111111111111",
        "department_name": "Municipality / Sanitation",
        "count": 24
      }
    ]
  }
}
```

#### 8. Civic Hotspot Statistics (`GET /api/v1/admin/complaints/hotspots`)
- **Role**: `ADMIN`
- **Description**: Returns anonymized geographic clusters (~1.1km grid) of complaints for city-wide heatmap and hotspot visualization. Citizen identities are strictly protected.
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Civic hotspots retrieved successfully",
  "data": {
    "hotspots": [
      {
        "cluster_id": "12.97,77.59",
        "latitude": 12.9718,
        "longitude": 77.5947,
        "complaint_count": 8,
        "status_summary": {
          "new": 2,
          "assigned": 3,
          "in_progress": 2,
          "resolved": 1
        },
        "departments": [
          {
            "department_id": "11111111-1111-1111-1111-111111111111",
            "department_name": "Municipality / Sanitation",
            "count": 5
          }
        ]
      }
    ]
  }
}
```

#### 9. Department Performance & SLA Statistics (`GET /api/v1/admin/departments/statistics`)
- **Role**: `ADMIN`
- **Description**: Returns operational resolution statistics and average turnaround time for each department.
- **Response (`200 OK`)**:
```json
{
  "success": true,
  "message": "Department statistics retrieved successfully",
  "data": {
    "departments": [
      {
        "department_id": "11111111-1111-1111-1111-111111111111",
        "department_name": "Municipality / Sanitation",
        "description": "Waste and sanitation",
        "active": true,
        "total_complaints": 24,
        "by_status": {
          "new": 4,
          "assigned": 6,
          "in_progress": 8,
          "resolved": 6
        },
        "average_resolution_time_hours": 18.5
      }
    ]
  }
}
```

---

## 5. Advanced Backend Features (B13)

### ⚡ Deterministic Priority Calculation
The backend evaluates complaint title, description, and department urgency on submission:
- **`CRITICAL`**: Public safety hazards (e.g. *live wire, gas leak, building collapse, open manhole, pipeline burst*). SLA target: **24 hours**.
- **`HIGH`**: Urgent public health/infrastructure concerns (e.g. *sewage overflow, garbage dump, contaminated water, traffic signal down*). SLA target: **48 hours**.
- **`MEDIUM`**: Standard civic issues (default). SLA target: **72 hours**.
- **`LOW`**: Routine cosmetic maintenance (e.g. *garden pruning, park bench, graffiti*). SLA target: **120 hours**.

### 🔍 Non-Blocking Duplicate Complaint Detection
When creating a complaint, the backend detects nearby complaints in the same department (within $\le 150\text{ meters}$) with matching keyword tokens:
```json
{
  "possible_duplicate": true,
  "duplicate_count": 1,
  "potential_duplicates": [
    {
      "id": "comp-uuid",
      "complaint_number": "CIV-428889",
      "title": "Sewage overflow on 4th block",
      "status": "IN_PROGRESS",
      "distance_meters": 35,
      "created_at": "2026-08-22T08:00:00.000Z"
    }
  ]
}
```
*Note: Submissions are never blocked; this provides helpful feedback for frontend UIs and officers.*

### ⏳ SLA & Aging Tracking
Complaint details returned by `GET /api/v1/complaints/:id` include live SLA calculation metrics:
```json
{
  "sla": {
    "age_hours": 14.5,
    "age_days": 0.6,
    "sla_threshold_hours": 24,
    "is_overdue": false,
    "resolution_time_hours": null
  }
}
```

### 🤖 Local AI Abstraction & Resilient Fallback
The backend features an extensible `IIssueClassifier` interface (`src/modules/ai/classifier.interface.ts`). When no local ML model is loaded, the system automatically falls back to deterministic rule routing with zero external API dependencies or costs.

---

## 6. End-to-End Workflow Diagram

```
[ CITIZEN ]                                           [ OFFICER ]
    │                                                      │
    ├─► Register / Login                                   ├─► Register as Officer (PENDING)
    │                                                      │          │
    ├─► Browse Departments & Offices                       │   [ ADMIN APPROVES ]
    │                                                      │          │
    ├─► Submit Complaint (Photo + GPS) ───[ NEW ]─────────┼──► Receives Notification
    │   ├─ Priority calculated (CRITICAL/HIGH/MED/LOW)     │          │
    │   └─ Duplicate scan (Non-blocking)                   ├─► Views Complaint & SLA
    │                                                      │          │
    ├─◄ Receives Submission Confirmation                   ├─► Accepts Complaint
    │                                                      │          │
    ├─◄ Receives "Complaint Assigned" ───[ ASSIGNED ]──────┼──► Starts Work
    │                                                      │          │
    ├─◄ Receives "Work Started" ────────[ IN_PROGRESS ]───┼──► Submits Photo & Note
    │                                                      │          │
    ├─◄ Receives "Complaint Resolved" ───[ RESOLVED ]─────┼──► Status: RESOLVED
    │                                                      │
    ├─► Views Resolved Complaint & Evidence                │
    └─► Manages In-App Notifications                       └─► Manages In-App Notifications
```
