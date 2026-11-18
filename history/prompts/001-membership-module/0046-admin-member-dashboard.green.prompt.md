---
id: 0046
title: Admin member dashboard
stage: green
date: 2026-11-18
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: master
user: Fakhruddins128
command: (direct request)
labels: ["dashboard", "admin", "member-accounts", "form-completion", "FR-112"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/src/services/memberFormCompletion.ts (new)
 - backend/src/services/memberDashboardService.ts (new)
 - backend/src/routes/memberDashboardRoutes.ts (new)
 - backend/src/server.ts
 - backend/src/__tests__/memberFormCompletion.test.ts (new)
 - frontend/src/features/member/memberDashboardApi.ts (new)
 - frontend/src/components/dashboard/MembersOverview.tsx (new)
 - frontend/src/components/dashboard/MembersOverview.test.tsx (new)
 - frontend/src/pages/DashboardPage.tsx
 - specs/001-membership-module/spec.md
 - CHANGELOG.md
tests:
 - frontend: 327 passing across 21 files (11 new, MembersOverview.test.tsx)
 - frontend: tsc -b clean, vite build clean
 - backend: tsc clean
 - backend: memberFormCompletion.test.ts written; NOT executed — globalSetup refuses a
   non-local DB_HOST and no local database exists on this machine. The same 20 assertions
   were run directly through tsx and all passed before the file was committed.
---

## Prompt

Make a dashboard in Admin How many members Already loged in and change there password. How many Percent member fill there form.

## Response snapshot

Added an administrator-only member dashboard to the existing Admin **Dashboard** page
(FR-112). Two sections.

**Member accounts.** Four figures — accounts, signed in, set their own password, never signed
in — plus a called-out line for the gap between the middle two. Signing in and changing the
password were reported separately because they genuinely come apart: every account is issued
a one-time password with `must_change_password` set, so a member can sign in, land on the
forced-change screen and stop. Collapsing them would hide exactly that member.
`must_change_password = 0` is the authority for "chose their own", not `password_changed_at`,
because an administrator's reset stamps the timestamp *and* sets the flag back to 1.

**Form completion.** An average percentage, a finished / started / untouched split, and the
same breakdown per tab.

The hard part was that the profile has **no mandatory fields** — deliberate, promised by
FR-095 and by the Hizb tab's own wording — so "completed" could not be derived from the save
validation and had to be *defined*. It is defined once, in a pure module
(`memberFormCompletion.ts`), as questions **answered** over questions **asked**, where asked
means the form actually puts that question in front of that member. Business owners are never
shown Designation; non-donors are never asked a donation date. Three exclusions are
deliberate and documented at the top of the file: the repeating lists (Sharaf, Maqamaat
Muqaddasah, Ashara Mubaraka, Titles, Skills, Tamreen methods), because an empty list cannot be
told apart from an unanswered one; the five phone boxes on Tab 1, which collapse into one
question; and `asbaq_ustad`, which is commented out of Tab 10 and so is never asked at all.

Privacy was handled at the query rather than in the response: the SQL selects **presence**
(1/0 per field), not values, so no blood group, height or weight is ever read. The seven
discriminants that decide which further questions apply are the only values loaded. The
endpoint returns counts and percentages and names no member.

Administrator-only, and the reason is scope rather than secrecy. A Zonal Head is confined
everywhere else to `member_profiles.zone_id`, and a member who has not reached Tab 3 has no
zone — precisely the member a completion figure is about. A zone-scoped version would omit
the people it was opened to find and report a healthier number than the truth.

No schema change: every column read already exists.

## Outcome

- ✅ Impact: `GET /api/v1/member-dashboard` (admin only) and a new section on the Admin
  Dashboard page. No schema change, no change to any existing endpoint or page.
- 🧪 Tests: 327 frontend tests pass across 21 files (11 new). Backend typechecks; the new
  backend test file could not be executed here (no local database) and its assertions were
  verified through `tsx` instead — all 20 passed, including that 100% is reachable for three
  different shapes of member.
- 📁 Files: 8 new, 3 modified (see front matter).
- 🔁 Next prompts: redeploy the backend so the new route exists; decide whether a
  zone-scoped version is wanted for Zonal Heads, which needs a zone that survives an empty
  profile (`provisioning_zone_id`, still unbuilt).
- 🧠 Reflection: the measure had to be checked for *reachability*, not only correctness. An
  earlier draft counted every field on every tab, which would have made 100% unattainable for
  any member who is not in a Party, holds no Sanad and gives no outside Khidmat — a figure
  nobody can reach is a figure nobody trusts, so "100% is reachable" became the test the
  design was built around.

## Evaluation notes (flywheel)

- Failure modes observed: the first field list silently included `asbaq_ustad`, which is
  commented out of Tab 10 — a question no member is ever shown, which would have depressed
  every member's score permanently and invisibly. Caught by walking each tab component rather
  than trusting the column list in `memberProfileService.ts`.
- Graders run and results (PASS/FAIL): frontend vitest PASS (327/327); frontend `tsc -b` PASS;
  frontend build PASS; backend `tsc` PASS; backend vitest NOT RUN (no local database);
  completion logic via tsx PASS (20/20).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): report the completion figure per Zone on the same
  page, which would answer "which zone is behind" without needing a Zonal Head login.
