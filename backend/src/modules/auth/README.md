# Authentication Module (Future Task)

This module will handle user authentication and authorization:
- Citizen registration / login (OTP / Password)
- Officer & Admin authentication
- JWT generation and token verification
- Role-Based Access Control (RBAC) middleware

### Planned Structure:
- `auth.controller.ts`: Handles HTTP request/response for auth endpoints
- `auth.service.ts`: Business logic for authentication & token issuing
- `auth.route.ts`: Express router definitions (`/api/v1/auth`)
- `auth.schema.ts`: Zod validation schemas for registration, login, etc.
- `auth.middleware.ts`: Auth verification middleware (`authenticate`, `authorize`)
