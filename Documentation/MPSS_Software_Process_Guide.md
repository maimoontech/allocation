# MPSS Software Process Guide

## 1. Purpose
This guide describes the recommended end-to-end software process for the **Masjid Party Scheduling Management System (MPSS)**, covering planning, development, testing, release, and operations. It is written to be usable by both technical and non-technical stakeholders.

## 2. Scope
Applies to:
- Backend API (Node.js/Express + Prisma + MySQL)
- Frontend SPA (React/Vite + Redux Toolkit/RTK Query)
- Database schema and migrations
- Role-based access control (Admin, Zonal Head, Party, Coordinator)
- Scheduling generation and manual edits
- Ratings and reports/analytics

Out of scope:
- Vendor integrations (WhatsApp/SMS), PDF/Excel export unless explicitly planned as a release feature

## 3. Roles & Responsibilities
- Product Owner (PO)
  - Owns requirements and priorities
  - Accepts or rejects completed work
- Project Manager / Scrum Master
  - Plans iterations, tracks risk, removes blockers
- Tech Lead
  - Owns architecture and engineering quality bar
  - Approves major technical decisions
- Backend Engineer
  - Owns API contracts, scheduling algorithm, database schema/migrations
- Frontend Engineer
  - Owns UI flows, state management, accessibility, responsiveness
- QA / Tester
  - Defines test cases, executes functional/regression testing
- DevOps / Operations
  - Owns environments, deployments, monitoring, backups

## 4. Process Overview (Lifecycle)
1. Requirements & discovery
2. UX/UI alignment
3. Technical design
4. Implementation
5. Testing & QA
6. Release
7. Operations & support
8. Continuous improvement

## 5. Requirements & Discovery
### 5.1 Inputs
- Business goals (fair scheduling, reduced manual work, role-scoped visibility)
- Core flows:
  - Login by role
  - Zonal Head schedule generation + overwrite confirmation
  - Manual schedule adjustments with history
  - Party mic/audio rating after Miqaat
  - Coordinator attendance/performance rating
  - Reports for Admin/Zonal Head

### 5.2 Requirement Format
Each feature should be documented with:
- User story (role + intent + value)
- Acceptance criteria (Given/When/Then)
- Data rules and validations
- Security/RBAC requirements
- API requirements (endpoint, request/response)
- UI requirements (screens, empty/loading/error states)

### 5.3 Definition of Ready (DoR)
Work item is ready when:
- Acceptance criteria are written and agreed
- UX/UI is available (or a clear placeholder UX decision exists)
- Data model impact is known (new fields/tables)
- RBAC decisions are explicit

## 6. UX/UI Alignment
### 6.1 Design Deliverables
- Screen list per role
- Navigation model (desktop sidebar, mobile tab bar)
- Design tokens (colors, typography, spacing)
- Component specs (modals, badges, rating sliders, tables/cards)

### 6.2 Accessibility & Responsiveness
- Target: WCAG 2.1 AA
- Keyboard navigation on all interactive controls
- Mobile usability for Party and Coordinator views

## 7. Technical Design
### 7.1 Architecture
- React SPA consumes REST API under `/api/v1`
- JWT-based auth, role claims enforced on API
- MySQL is source of truth; use migrations for schema changes

### 7.2 API Standards
- JSON responses use a consistent envelope:
  - `{ success, data, message }` plus optional metadata
- Errors:
  - 401 Unauthorized (no/invalid token)
  - 403 Forbidden (role not allowed)
  - 409 Conflict for schedule overwrite protection

### 7.3 Database Standards
- Use soft deletes where needed (inactive/deletedAt) for auditability
- Use transactions for schedule generation and overwrite
- Enforce uniqueness where needed (e.g., one assignment per party per Miqaat)

### 7.4 Scheduling Algorithm Rules (Core)
The schedule generator must:
- Use active parties only (exclude category H from auto scheduling)
- Respect venue min/max parties
- Prefer fairness (avoid repeating the same venue for a party until rotation completes)
- Try to ensure at least one Category A per venue when possible
- Provide warnings if min parties cannot be met
- Support overwrite flow:
  - If schedule exists and overwrite is not explicitly requested, return HTTP 409
  - If overwrite is true, remove relevant schedule rows and regenerate within a transaction
- Record manual edit history for audit/reporting

## 8. Implementation Workflow
### 8.1 Branching
Recommended:
- `main`: stable releases
- `develop` (optional): integration branch
- `feature/<name>`: feature branches
- `hotfix/<name>`: urgent production fixes

### 8.2 Pull Request (PR) Checklist
- Implements acceptance criteria
- No secrets committed
- RBAC enforced server-side
- DB migrations included if schema changed
- API contract documented in PR description
- Frontend handles loading/empty/error states
- Verified locally (build passes, key flows work)

### 8.3 Code Quality Standards
- Consistent formatting and lint rules
- Prefer explicit types at boundaries (API payloads, reducers)
- Avoid duplicating business rules in UI; server is authoritative

## 9. Testing Strategy
### 9.1 Test Levels
- Unit tests
  - Scheduling algorithm, validators, utility functions
- Integration tests
  - API endpoints with RBAC, schedule overwrite behavior, rating submission rules
- UI tests (optional but recommended)
  - Login + protected routes, schedule generation flow, rating flows
- Regression tests
  - Run before release; includes a standard checklist of critical flows

### 9.2 Minimum Regression Checklist
- Login for all roles works
- RBAC:
  - Party cannot access admin endpoints
  - Coordinator cannot rate mic/audio (only performance)
  - Party cannot rate performance (only mic/audio)
- Zonal Head:
  - Generate schedule creates rows
  - Generate again without overwrite returns 409
  - Overwrite regenerates schedule
  - Manual move updates schedule + logs edit history
- Party:
  - Can view own schedule
  - Can submit mic/audio rating
- Coordinator:
  - Can view assigned parties by venue/miqaat
  - Can submit performance rating with attendance flag

## 10. Release Management
### 10.1 Versioning
Recommended semantic versioning:
- MAJOR: breaking API or workflow changes
- MINOR: backward-compatible features
- PATCH: bug fixes

### 10.2 Environments
- Local (developer machine)
- Staging (QA/UAT)
- Production

### 10.3 Release Steps
1. Ensure migrations are ready and tested on staging
2. Run full regression checklist
3. Tag release version
4. Deploy backend then frontend
5. Verify health endpoint and critical flows
6. Monitor logs and error rates

### 10.4 Rollback Plan
- Backend:
  - Keep previous build artifact available
  - If migration is not backward compatible, define a rollback migration or block release
- Frontend:
  - Roll back to previous static build immediately if needed

## 11. Operations & Support
### 11.1 Monitoring
- API health: `/api/v1/health`
- Track:
  - Auth failures
  - Schedule generation failures/latency
  - DB connection errors
  - 4xx/5xx rates

### 11.2 Backups
- Daily automated DB backups (minimum)
- Test restore procedure periodically

### 11.3 Security
- Store password hashes only (bcrypt)
- Rotate JWT secrets for production
- Enforce HTTPS in production
- Validate inputs on server (schema validation)

## 12. Change Control
### 12.1 Common Change Types
- New report endpoint
- New schedule fairness rule
- New fields in core entities (zones, parties, venues, miqaats)

### 12.2 Approval & Documentation
For changes affecting scheduling logic or RBAC:
- Tech Lead approval required
- Update acceptance criteria and regression checklist

## 13. Handover & Training
- Provide role-based walkthrough:
  - Admin: manage master data + reports
  - Zonal Head: generate and adjust schedules
  - Party: view schedule and rate mic/audio
  - Coordinator: attendance and performance rating
- Provide a support channel and escalation path

## 14. Done Criteria (Definition of Done)
A feature is “Done” when:
- All acceptance criteria pass
- Required RBAC enforced and tested
- UI meets UX spec (including loading/empty/error)
- Build passes for server and client
- Regression checklist updated if needed
- Release notes prepared (if part of a release)
