# Project Context — MPSS / Zakereen Allocation

## Overview

The application is a Masjid Party Scheduling System (MPSS), also referred to as Zakereen Allocation. It manages zones, mohallahs, parties, venues, Miqaats, schedules, ratings, reports and import/export operations.

The current repository contains a React/Vite frontend and a Node.js/Express/MySQL backend.

## Roles

- Admin
- Zonal Head
- Party
- Coordinator
- Member

## Main Functional Areas

0. Membership — member sign-in, forced first-login password change, and the twelve-tab member
   profile. Added on the `001-membership-module` branch; see `specs/001-membership-module/`.
1. Authentication and password management
2. Zones
3. Mohallahs
4. Parties
5. Venues
6. Miqaats
7. Schedule generation
8. Manual schedule editing
9. Schedule publishing
10. Coordinator attendance/performance ratings
11. Party mic/audio ratings
12. Reports
13. Import/export

## User Flows

### Admin
Admin can manage master data, schedules, publishing, ratings/reporting and import/export according to route-level role checks.

### Zonal Head
Zonal Head is scoped to a zone and can generate/manage schedules within that zone according to backend authorization.

### Party
Party users can access their own schedule and submit party-side mic/audio ratings according to the current route rules.

### Coordinator
Coordinator users are associated with a venue and can access assigned parties and submit attendance/performance ratings.

### Member
Members sign in with their ITS Number and a password, and reach exactly one thing: their own
profile. Accounts are provisioned by an admin from a roster with a temporary password, and the
first sign-in forces a password change before the profile is reachable. A member's own token
is the only thing that identifies them to the API — no endpoint takes a member id — so a
member cannot read or modify another member's data.

The twelve-tab profile is one page and one save: Personal, Title & Prefix, Hizb, Occupation,
Education/Hifz, Health & Fitness, Sharaf, Places Visited, Ashara Mubaraka, Asbaq, Tamreen and
Other Sansta Khidmat.

## Frontend Routes

Defined in `frontend/src/router/AppRoutes.tsx`.

Important route/page areas include:
- Login
- Dashboard
- Change Password
- Zones
- Mohallahs
- Parties
- Venues
- Miqaats
- Schedules
- Reports
- Import/Export
- Coordinator assigned parties
- Coordinator attendance rating
- Party schedule
- Party mic rating
- Member forced password change
- Member profile (twelve tabs)
- Admin member accounts

## Backend API Groups

Mounted under `/api/v1`:
- `/auth`
- `/zones`
- `/mohallahs`
- `/parties`
- `/venues`
- `/miqaats`
- `/schedules`
- `/reports`
- `/ratings`
- `/import-export`
- `/members` — member-owned profile, lookups and photo; plus admin account management on the
  same base path, registered after the member routers so a member reading their own profile is
  not caught by the admin role check

Health endpoint: `/health`.

## Database

MySQL database named by environment configuration. Current SQL schema is under `database/mpss_mysql.sql` with incremental SQL files.

## External/Deployment Context

The source contains frontend deployment configuration for Vercel and CORS origins for deployed frontend domains. Do not assume deployment infrastructure is unchanged; verify environment/deployment files before modifying.

## Existing Documentation

The `Documentation/` directory contains:
- software process guide
- UI/UX design specification
- developer documentation
- non-technical user guide
- schedule spreadsheets/PDFs
- supporting Hijri calendar PHP file

These are useful business references, but source code remains authoritative for current implementation.

## Current Technical Baseline

Frontend:
- React 18
- TypeScript
- Vite
- Redux Toolkit
- React Router
- Tailwind

Backend:
- Express
- TypeScript
- MySQL2
- JWT
- bcryptjs

## Known Documentation Drift

Some older documentation refers to Prisma. The current backend source uses `mysql2/promise` directly. Claude should not introduce Prisma merely to match older documentation.

## Important Existing Risks

- Environment configuration included fallback credentials/secrets in source code. Resolved 2026-09-13; required variables are now validated at startup and the process exits if any is missing. The old values persist in Git history and require rotation.
- Startup schema mutation is implemented in `ensureSchema.ts`.
- Scheduling logic is complex and business-critical.
- Debug/temporary scripts are present and require careful handling.
- Built `dist` directories are present; source should remain the primary editable code.
