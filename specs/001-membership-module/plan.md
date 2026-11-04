# Implementation Plan: Member Login and 12-Tab Member Profile

**Branch**: `001-membership-module` | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-membership-module/spec.md`

## Summary

Add a fifth login type, **Member**, authenticated by ITS Number against its own account table,
forced through a password change on first use, and leading to a one-page twelve-tab profile the
member maintains themselves. The system is live, so the governing constraint is that the four
existing roles — above all Party — must behave exactly as they do today.

The approach is shaped by what the codebase already is. `authenticate()` dispatches on role
across per-role tables, so a new role means a new table and a new branch, not a new
architecture. Twenty new tables are added and **not one existing table is altered**, which makes
FR-106 true by construction and reduces rollback to dropping what was created. The one genuinely
risky edit is a five-line insertion into `authService.ts` immediately above an unguarded
fallthrough that currently catches coordinator logins — so the plan writes the Party and
Coordinator regression tests *first*, against unmodified code, before that insertion is made.

Full reasoning for every choice is in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript — backend `ES2022`/`NodeNext`/`strict`, frontend `~6.0.2` via `tsc -b`
**Primary Dependencies**: Backend — Express 5, `mysql2/promise` (named placeholders), `jsonwebtoken`, `bcryptjs` (cost 10). Frontend — React 18, Vite 8, Redux Toolkit (RTK Query), React Router 6, Tailwind 3. **No new runtime dependency is added.**
**Storage**: MySQL 8 / InnoDB / `utf8mb4` with tables in **`utf8mb4_general_ci`** (verified against a live restore; `mpss_mysql.sql`'s `utf8mb4_unicode_ci` declaration is wrong). Raw SQL, no ORM. Schema by hand-run `.sql`, plus boot-time column patching in `ensureSchema.ts` that this feature deliberately does not use.
**Testing**: Vitest + `supertest` (backend) and Vitest + React Testing Library (frontend) — **all new**; the repo has no test infrastructure whatsoever (research R11).
**Target Platform**: Frontend SPA on Vercel; backend on Render (ephemeral filesystem); MySQL external.
**Project Type**: Web — existing `backend/` + `frontend/` split, unchanged.
**Performance Goals**: Profile opens in one `GET` plus one lookups `GET`; saves in one transactional `PUT`. Photographs capped at 2 MB and served from a table kept off the profile row.
**Constraints**: No change to Party Login behaviour (FR-102). No existing table altered (FR-106). No new dependency. Additive, idempotent, reversible migration. `express.json` stays at its existing `5mb`.
**Scale/Scope**: A few thousand members. 20 new tables, ~10 endpoints (2 of them extensions of existing ones), 8 new UI primitives, 1 twelve-tab page.

**No NEEDS CLARIFICATION remains.** The five unverifiable facts about the production database
are listed in [research R13](./research.md#r13--unverifiable-facts-about-the-production-database);
each is handled by a design that does not depend on the answer, so none blocks this plan.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status: cannot be evaluated — `.specify/memory/constitution.md` is still the unfilled
template** (`[PRINCIPLE_1_NAME]`, `[PRINCIPLE_1_DESCRIPTION]`, …). There are no ratified
principles to check this plan against.

This is reported rather than worked around. Inventing principles here and then declaring the
plan compliant with them would be a check that proves nothing. **Recommend running
`/sp.constitution` before Stage 2 begins.**

In place of that gate, the plan was checked against the project's actual written standards,
which are real and specific:

| Source | Requirement | Status |
|---|---|---|
| `CLAUDE.md` | Smallest viable diff; no unrelated refactoring | ✅ No existing table altered; two endpoints extended rather than replaced; `calculateHijriDate` left untouched |
| `CLAUDE.md` | Never hardcode secrets | ✅ The throttle's IP salt comes from env, like `JWT_SECRET` |
| `CLAUDE.md` | Cite existing code precisely | ✅ Throughout `research.md`, `data-model.md` and `PROJECT_AS_IS.md` |
| `ARCHITECTURE.md` | Replacing authentication needs prior design discussion | ✅ Authentication is **extended**, not replaced. The existing four paths are untouched |
| `ARCHITECTURE.md` | Don't introduce repositories/controllers or new DB access patterns | ✅ New routers follow `miqaatsRoutes.ts`; `pool` + named placeholders throughout |
| `DATABASE.md` | Inspect schema and all code references before any DB change | ✅ [PROJECT_AS_IS.md §5](../../PROJECT_AS_IS.md#5-current-schema) |
| `DATABASE.md` | No arbitrary schema changes in `ensureSchema.ts` | ✅ Explicitly avoided (research R9) |
| `DATABASE.md` | Produce a migration script and document rollback | ✅ [migrations/](./migrations/) — three scripts, additive, idempotent |
| `BUSINESS_RULES.md` | Backend is the authoritative enforcement layer | ✅ FR-028; `requireMember` reads account state server-side |
| `BUSINESS_RULES.md` | Don't change a business rule without confirming intent | ✅ Four deviations from the request tabulated in `checklists/requirements.md` |

**Re-checked after Phase 1 design: unchanged.** The design added no dependency, no new
architectural layer and no modification to an existing table. The one deliberate departure from
existing schema habit — `ON DELETE SET NULL` on `member_profiles.zone_id` / `party_id` instead of
the codebase's blanket `CASCADE` — is justified in
[data-model.md §4](./data-model.md#tab-3--hizb) and recorded under Complexity Tracking below.

## Project Structure

### Documentation (this feature)

```text
specs/001-membership-module/
├── spec.md                               # Stage 1 — 107 requirements, 12 tabs
├── plan.md                               # This file
├── research.md                           # Phase 0 — 13 decisions
├── data-model.md                         # Phase 1 — 20 tables (the database design deliverable)
├── quickstart.md                         # Phase 1 — apply, verify, demonstrate, roll back
├── contracts/
│   └── member-api.openapi.yaml           # Phase 1 — 10 operations
├── migrations/                           # Draft SQL — NOT EXECUTED
│   ├── membership_schema.sql   #   20 tables, additive, idempotent
│   ├── membership_seed.sql     #   lookup seeds; 4 lists intentionally empty
│   └── membership_rollback.sql #   drops the 20, scoped refresh-token cleanup
├── checklists/
│   └── requirements.md                   # Stage 1 quality checklist
└── tasks.md                              # Phase 2 — /sp.tasks, NOT created here
```

Draft SQL sits under `specs/`, not `database/`, so nothing unapproved rests where it looks
runnable. On approval it moves to `database/` under that directory's convention.

### Source Code (repository root)

```text
backend/src/
├── config/env.ts                      # MODIFY  throttle window + IP salt
├── db/
│   ├── pool.ts                        # unchanged
│   └── ensureSchema.ts                # DELIBERATELY UNCHANGED (research R9)
├── middleware/
│   ├── auth.ts                        # MODIFY  Role union + memberId claim
│   └── requireMember.ts               # NEW     active / password-change / token-age guard
├── routes/
│   ├── authRoutes.ts                  # MODIFY  change-password role guard
│   ├── memberProfileRoutes.ts         # NEW     GET, PUT /members/me/profile
│   ├── memberPhotoRoutes.ts           # NEW     GET, PUT, DELETE /members/me/photo
│   ├── memberLookupsRoutes.ts         # NEW     GET /members/lookups
│   ├── memberAdminRoutes.ts           # NEW     GET /members, PATCH /members/:id
│   └── importExportRoutes.ts          # MODIFY  'members' entity in the switch
├── services/
│   ├── authService.ts                 # MODIFY  member branch + changePassword branch
│   ├── memberProfileService.ts        # NEW     transactional read/save, all validation
│   └── loginThrottleService.ts        # NEW     record + evaluate attempts
├── utils/
│   ├── response.ts                    # unchanged
│   ├── hijriDate.ts                   # NEW     port of the frontend util
│   └── imageValidation.ts             # NEW     magic-byte check
└── __tests__/
    ├── regression/authExistingRoles.test.ts   # NEW  WRITE FIRST (§2 of quickstart)
    ├── memberAuth.test.ts                     # NEW
    ├── memberProfile.test.ts                  # NEW
    └── hijriDate.test.ts                      # NEW  shared vectors with the frontend

frontend/src/
├── types.ts                           # MODIFY  Role union
├── utils/hijriDate.ts                 # MODIFY  ADD calculateHijriParts; existing export untouched
├── pages/
│   ├── LoginPage.tsx                  # MODIFY  roleOptions + defaultPathByRole
│   ├── ChangePasswordPage.tsx         # MODIFY  forced-change mode
│   └── member/
│       ├── MemberProfilePage.tsx      # NEW     the 12-tab container
│       └── tabs/Tab01Personal.tsx …Tab12Khidmat.tsx   # NEW  12 components
├── features/member/
│   ├── memberApi.ts                   # NEW     RTK Query slice
│   └── memberProfileSlice.ts          # NEW     unsaved-edit state across tabs (FR-026)
├── components/
│   ├── layout/AppShell.tsx            # MODIFY  navByRole member entry (compiler-forced)
│   └── ui/                            # NEW     Tabs, Textarea, RadioGroup, YesNoField,
│       │                              #         MultiSelect, DatePicker, ImageUpload,
│       │                              #         RepeatableRows
│       └── (Button, Card, Input, Select unchanged)
└── router/
    ├── AppRoutes.tsx                  # MODIFY  member routes
    └── ProtectedRoute.tsx             # MODIFY  password-change redirect
```

**Structure Decision**: the existing `backend/` + `frontend/` split is kept exactly as it is.
Every new backend file follows the established shape — one `Router` per domain, SQL inlined via
`pool` with named placeholders, responses through `ok()`/`fail()` — and only the two
genuinely cross-cutting concerns (`memberProfileService`, `loginThrottleService`) are extracted
into services, matching how `authService` and `scheduleService` are the only existing ones.

Three choices in this layout carry weight:

- **`requireMember` is its own middleware file**, not a branch inside `requireAuth`. That keeps the per-request database read — which FR-007, FR-018 and FR-022 all need — entirely off the path the four existing roles take, so FR-103 holds by construction rather than by care.
- **`frontend/src/utils/hijriDate.ts` is extended, never changed.** `calculateHijriDate` keeps its signature and output; `calculateHijriParts` is added beside it. `MiqaatsPage.tsx:125`, its only caller, is untouched.
- **`memberProfileSlice`** holds edits across tab switches in client state, which is what makes FR-026 a UI concern rather than twelve endpoints.

## Phase sequencing

Independently verifiable, and ordered so the riskiest edit happens *after* its safety net exists.
Per-step verification is in [quickstart.md §5](./quickstart.md#5-build-order).

| Phase | Work | Why here |
|---|---|---|
| **A. Safety net** | Vitest + supertest + RTL; **Party and Coordinator regression tests written and passing against unmodified code** | The `member` branch goes two lines above the fallthrough that currently catches coordinators. Written afterwards, these tests prove nothing about the prior behaviour |
| **B. Hijri** | `calculateHijriParts` in the frontend; port to the backend; shared test vectors | Needed by Tab 1 and Tab 9, and by server-side validation. Touches no auth |
| **C. Schema** | Apply `database/membership_schema.sql` + `membership_seed.sql` to a restored copy; verify counts unchanged | Everything below needs tables. Additive, so no read path changes |
| **D. Authentication** | `Role` union (both files), member branch in `authenticate()`, `requireMember`, member branch in `changePassword`, throttling | The riskiest work, now covered by Phase A |
| **E. Frontend auth** | `roleOptions`, `defaultPathByRole`, `navByRole`, `ProtectedRoute`, forced-change screen | Delivers spec story 3 end to end |
| **F. UI primitives** | 8 new components | No business logic; parallelisable with G |
| **G. Profile API** | Lookups, `GET`/`PUT` profile, photo endpoints | Independently testable by curl before any UI exists |
| **H. The form** | 12-tab page + the 12 tab components | Needs F and G |
| **I. Provisioning** | `members` entity in `importExportRoutes.ts`; admin list and active toggle | Could come earlier, but leaving it last keeps accounts out of production until the journey works |
| **J. Release** | [quickstart.md §9](./quickstart.md#9-production-release) | Pilot roster before the full one |

Phase A before D is the single most important ordering decision in this plan.

## Risks

| Risk | Blast radius | Guardrail |
|---|---|---|
| **The `member` branch is misplaced in `authenticate()`** and captures or breaks coordinator login — the function reaches the venue query by falling through with no role check (`authService.ts:113`) | Every Coordinator locked out of a live system | Phase A's regression tests, written first and re-run after every step. The branch is inserted **above** line 113 and explicitly guards `role === "member"` |
| **Plaintext passwords travel in provisioning spreadsheets.** Reusing the existing import path inherits this; it is pre-existing behaviour for zones, parties and venues, not something this feature introduces | A leaked roster file exposes every temporary password | Forced change on first login limits the window. **Flagged for a deliberate decision** rather than inherited by default — see [research R12](./research.md#r12--member-account-provisioning) |
| **The per-request account read in `requireMember` adds latency**, and if it ever leaked onto the shared path it would slow every role | Member routes slower; a mistake would touch all roles | One indexed primary-key lookup, confined to a separate middleware file that existing routes never mount |
| Generated `bmi` column needs MySQL 5.7+, and the server version cannot be verified from the repo | Migration aborts at step 0 | The script probes the version and fails with a clear message; documented fallback computes BMI in the API ([research R6](./research.md#r6--deriving-bmi-so-it-cannot-be-overwritten)) |
| Four lookup lists ship empty because seeding them would mean inventing religious terminology | Tabs 2, 7, 9, 10 are incomplete until you supply the values | FR-095: an empty list explains itself and the rest of the profile still saves. `places` is derived from live `miqaats` data instead of invented |
| Photographs grow the database — ~1 GB at 5,000 members | Backup and restore times | 2 MB cap, client-side downscaling, blob kept in its own table off the profile row; reviewed at provisioning time |
| A long form outliving a 1-day token, with `/auth/refresh` currently uncalled by the UI and no 401 interceptor | A member loses a half-filled profile | FR-032: unsaved edits held in `memberProfileSlice` survive re-authentication. Wiring up the existing refresh endpoint is worth doing here |

## Complexity Tracking

> Filled because the Constitution Check could not be evaluated. These are the three places
> this design departs from existing practice, recorded so each can be overruled.

| Departure | Why needed | Simpler alternative rejected because |
|---|---|---|
| `ON DELETE SET NULL` on `member_profiles.zone_id` and `party_id`, against the schema's blanket `ON DELETE CASCADE` | Cascading would **delete a member's entire profile** because their Zone or Party was removed | Following `CASCADE` for consistency would destroy personal data as a side effect of unrelated master-data housekeeping |
| A per-request database read in `requireMember`, where existing roles read only JWT claims | FR-007 (deactivated refused), FR-018 (no access before the password change) and FR-022 (old sessions stop working) all need *current* account state, which a static claim cannot carry | Claims-only would make all three requirements unreachable; shortening the token lifetime narrows the window without closing it |
| A virtual generated column for `bmi`, a mechanism the schema does not currently use | Makes FR-064's read-only guarantee structural — MySQL rejects any write — so no future API or UI bug can corrupt it or let it drift from its inputs | A plain column written by the API can drift and be overwritten; computing only in the browser fails FR-028 |

## Open items for your sign-off

Not blockers for `/sp.tasks`, but each changes the work if you decide differently.

1. **The 18 assumptions in [spec.md](./spec.md#assumptions)** — items 5 to 18 are my proposals, not your decisions. (Items 17 and 18 were added when Tab 8 was corrected from Miqaat to Places Visited.)
2. **Four lookup lists need authoritative values**: `titles`, `sharafs`, `halqas`, `mozes`.
3. **Plaintext passwords in provisioning spreadsheets** — inherited from the existing import path; worth an explicit decision.
4. **A retention position** for the profile of a member who leaves. FR-007 retains the data; for how long is undecided.
5. **`/sp.constitution`** — so the gate above can actually be evaluated next time.

## Artifacts produced

| File | Phase |
|---|---|
| [research.md](./research.md) | 0 — 13 decisions, no clarifications outstanding |
| [data-model.md](./data-model.md) | 1 — 20 new tables, 0 altered |
| [contracts/member-api.openapi.yaml](./contracts/member-api.openapi.yaml) | 1 — 10 operations |
| [quickstart.md](./quickstart.md) | 1 — apply, verify, demonstrate, roll back, release |
| [../../database/sources/membership_schema.sql](../../database/sources/membership_schema.sql) | 1 — **not executed** |
| [../../database/sources/membership_seed.sql](../../database/sources/membership_seed.sql) | 1 — **not executed** |
| [../../database/membership_rollback.sql](../../database/membership_rollback.sql) | 1 — **not executed** |

**Next**: `/sp.tasks` for the dependency-ordered task list. No application code, schema or
database has been changed by this plan.
