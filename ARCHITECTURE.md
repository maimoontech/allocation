# Architecture — MPSS

## High-Level

```text
                    Browser
                       |
                       v
             React + TypeScript + Vite
                       |
                 Redux Toolkit
                       |
                REST / JSON / JWT
                       |
                       v
              Express + TypeScript
                       |
                Route Middleware
                       |
              Services / SQL Access
                       |
                       v
                    MySQL
```

## Frontend

Entry:
- `frontend/src/main.tsx`

Application:
- `frontend/src/App.tsx`

Routing:
- `frontend/src/router/AppRoutes.tsx`
- `frontend/src/router/ProtectedRoute.tsx`

State:
- `frontend/src/store.ts`
- `frontend/src/hooks/storeHooks.ts`

Feature/API modules:
- `frontend/src/features/auth`
- `frontend/src/features/zones`
- `frontend/src/features/mohallahs`
- `frontend/src/features/parties`
- `frontend/src/features/venues`
- `frontend/src/features/miqaats`
- `frontend/src/features/schedules`
- `frontend/src/features/reports`
- `frontend/src/features/ratings`
- `frontend/src/features/api`

Shared UI:
- `frontend/src/components/layout`
- `frontend/src/components/ui`

Pages are split into common, module, coordinator and party areas.

## Backend

Entry:
- `backend/src/server.ts`

Configuration:
- `backend/src/config/env.ts`

Database:
- `backend/src/db/pool.ts`
- `backend/src/db/ensureSchema.ts`

Middleware:
- `backend/src/middleware/auth.ts`

Routes:
- `backend/src/routes/*`

Services:
- `backend/src/services/authService.ts`
- `backend/src/services/scheduleService.ts`

Response:
- `backend/src/utils/response.ts`

## Request Flow

```text
UI
 -> feature API module
 -> shared API client
 -> /api/v1/<resource>
 -> Express route
 -> requireAuth / requireRole where configured
 -> service or database query
 -> MySQL
 -> response helper
 -> frontend state/UI
```

## Authentication Flow

```text
Login form
   |
   v
POST /api/v1/auth/...
   |
   v
authService.authenticate()
   |
   +--> load role-specific user
   +--> bcrypt password verification
   +--> issue JWT + refresh token
   |
   v
Frontend stores auth state
   |
   v
Protected API requests include access token
```

Refresh-token behavior is implemented by `authService.ts` and persisted in `refresh_tokens`.

## Scheduling Flow

```text
Admin/Zonal Head
      |
      v
POST /api/v1/schedules/generate
      |
      v
requireAuth + requireRole
      |
      v
scheduleService.generateSchedule()
      |
      +--> load active venues
      +--> load active parties
      +--> validate Miqaat
      +--> check existing schedule
      +--> load historical visit/fairness information
      +--> build assignments
      +--> persist within transaction
      |
      v
response
```

The scheduling service is a domain-heavy service and should not be casually refactored.

## Database Access

The current backend uses `mysql2/promise` and named placeholders.

There is no Prisma runtime in the current backend source, despite some older documentation referring to Prisma.

## Build Artifacts

- `frontend/dist`
- `backend/dist`

These are generated artifacts. Modify source files under `src`, then rebuild.

## Architecture Change Policy

Any large change such as:
- introducing repositories/controllers
- changing state-management architecture
- replacing MySQL access
- replacing authentication
- rewriting scheduling logic

requires a design discussion before implementation.
