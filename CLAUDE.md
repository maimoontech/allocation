# CLAUDE.md — MPSS / Zakereen Allocation

## Purpose

This repository is the **Masjid Party Scheduling System (MPSS) / Zakereen Allocation** application. It was originally developed with Trae AI and is now intended to be maintained and extended with Claude Code.

This file is the primary instruction file for Claude Code. Read it before making changes.

## Source of Truth

For implementation facts, prefer this order:

1. Actual source code in `frontend/src` and `backend/src`
2. SQL files under `database/`
3. Existing project documentation under `Documentation/`
4. Git history
5. This file and generated context documents

If documentation conflicts with code, investigate and document the discrepancy before changing behavior.

## Required Reading Before Coding

Read, when relevant:

- `PROJECT_CONTEXT.md`
- `ARCHITECTURE.md`
- `API_DOCUMENTATION.md`
- `DATABASE.md`
- `BUSINESS_RULES.md`
- `CHANGELOG.md`
- `Documentation/MPSS_Software_Process_Guide.md`
- `Documentation/MPSS_UIUX_Design_Specification.docx`
- `Documentation/MPSS_Developer_ReactJS_MySQL.docx`

For scheduling work, also inspect:
- `backend/src/services/scheduleService.ts`
- `backend/src/routes/schedulesRoutes.ts`
- `debug-duplicate-assignment.md`
- `debug-schedule-duplicates.md`
- relevant files under `.dbg/` only when debugging the related issue

## Critical Development Rules

1. **Analyze first, code second.**
2. Search the repository for existing functionality before creating new code.
3. Do not rewrite working functionality unnecessarily.
4. Keep changes minimal and focused on the requested task.
5. Do not perform unrelated refactors.
6. Do not change the scheduling algorithm without understanding and preserving its business constraints.
7. Do not change database schema without an explicit SQL migration/update script.
8. Do not silently change API contracts.
9. Enforce authorization server-side; do not rely on UI hiding alone.
10. Never expose or copy credentials, tokens, or secrets into source, documentation, commits, or responses.
11. Do not commit `.env` or other secret-bearing files.
12. Do not install new dependencies unless necessary; explain why before adding them.
13. Preserve responsive/mobile behavior.
14. Prefer existing UI components and existing API utilities.
15. When fixing a bug, add or update a regression check where practical.
16. After changes, inspect the final diff and ensure unrelated files were not changed.

## Technology

### Frontend
- React 18.3
- TypeScript
- Vite 8
- React Router 6
- Redux Toolkit
- React Redux
- Tailwind CSS 3
- jsPDF + jsPDF AutoTable
- ESLint

### Backend
- Node.js
- TypeScript
- Express 5
- MySQL2
- JWT
- bcryptjs
- CORS
- dotenv
- tsx

### Database
- MySQL

## Project Structure

```text
frontend/
  src/
    features/        API slices/modules
    components/      shared UI
    pages/           application screens
    router/          routing and protected routes
    hooks/           Redux hooks
    utils/           formatting, storage, PDF, Hijri date helpers
    store.ts         Redux store

backend/
  src/
    config/          environment configuration
    db/              MySQL pool/schema checks
    middleware/      authentication/authorization
    routes/          REST API routes
    services/        business logic, especially scheduling
    utils/            response helpers
    server.ts        Express application entry point

database/
  SQL schema and incremental database scripts

Documentation/
  product, developer, UI/UX, user and process documentation
```

## Roles

Current application roles:

- `admin`
- `zonal_head`
- `party`
- `coordinator`

Role and scope information is carried in JWT claims and enforced by backend middleware/routes.

## Scheduling Is Business-Critical

The schedule generator is not a generic CRUD operation.

When changing scheduling behavior, inspect the full algorithm and tests/debug artifacts first. Preserve, unless the requirement explicitly changes them:

- active-party rules
- category A/B/C ordering
- category H exclusion from automatic scheduling
- venue minimum/maximum capacity
- fairness/rotation behavior
- avoidance of immediate venue repetition
- overwrite protection
- transaction behavior
- manual edit/audit history
- zone scoping
- publish flow
- rating/completion relationships

Do not optimize or simplify the algorithm merely because a shorter implementation is possible.

## Database Rules

The backend uses `mysql2/promise` with named placeholders.

Database changes must:
- be represented by a repeatable SQL script when appropriate
- preserve existing data unless migration explicitly requires otherwise
- consider indexes, foreign keys, uniqueness and existing application queries
- be documented

Note: `backend/src/db/ensureSchema.ts` currently performs startup schema checks/ALTER operations. Treat these as existing behavior and do not expand this pattern without review.

## API Rules

API base path is `/api/v1`.

Use the existing response helpers and route conventions.

Before changing an endpoint:
1. Find all frontend callers.
2. Inspect the route authorization.
3. Inspect request validation.
4. Inspect response shape.
5. Check whether reports/export/PDF/UI code depends on the response.
6. Update API documentation if the contract changes.

## Authentication/Security

Authentication uses JWT access tokens and refresh tokens.

The four roles have different login identifiers/scopes. Passwords are verified with bcrypt in the current authentication service.

Treat security changes as high-impact. Never hard-code secrets or publish real environment values.

## Frontend Rules

- Use TypeScript types at API/state boundaries.
- Reuse Redux/API modules under `frontend/src/features`.
- Reuse shared components under `frontend/src/components/ui`.
- Keep role-specific access consistent with backend authorization.
- Preserve mobile and desktop layouts.
- Handle loading, empty and error states.
- Avoid duplicated API logic.

## Documentation Rules

When a meaningful feature, bug fix, API change, database change, or business-rule change is completed:
- update `CHANGELOG.md`
- update the relevant context/API/database/business-rule document
- do not overwrite historical facts

## Standard Workflow

### Before implementation
Return:
- understanding of requirement
- affected files
- relevant business rules
- API/database impact
- implementation plan
- risks

### During implementation
- make focused changes
- reuse existing code
- do not modify unrelated files

### After implementation
Run relevant checks, normally:
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- `cd backend && npm run build`

Use additional targeted tests/scripts when relevant.

Then report:
- files changed
- behavior changed
- tests/checks
- database/API changes
- remaining risks

## Important Existing Technical Findings

- Frontend is React + TypeScript + Vite, not the older CRA setup.
- Backend is TypeScript + Express + MySQL.
- `backend/src/services/scheduleService.ts` contains substantial scheduling logic.
- `backend/src/db/ensureSchema.ts` performs schema checks and ALTER operations at startup.
- There are generated `frontend/dist` and `backend/dist` directories; prefer editing `src` and regenerate builds rather than editing `dist` directly.
- The repository contains temporary scheduling/debug scripts. Do not delete or execute them blindly; inspect purpose first.
- Existing documentation describes Prisma in some places, but the current backend source uses `mysql2` directly. The current source code is authoritative.
- Environment configuration previously contained fallback database/secret values in source. This was resolved on 2026-09-13: `backend/src/config/env.ts` now requires `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS` and `JWT_SECRET` and refuses to start if any is missing. Never reintroduce a default value for a credential. Local values belong in the gitignored `backend/.env` (see `backend/.env.example`); deployed values belong in the hosting provider's environment configuration. The previously committed values remain in Git history and must be treated as compromised until rotated.

## Safe Mode for Ambiguous Requests

If a request could change:
- schedule allocation rules
- role permissions
- database schema
- published schedules
- historical/audit records
- authentication

stop before implementation and explain the impact/assumptions. Ask for confirmation if the intended behavior is not explicit.
