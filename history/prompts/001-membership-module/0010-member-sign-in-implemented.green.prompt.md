---
id: 0010
title: Member Sign In Implemented
stage: green
date: 2026-10-29
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["phase-5", "member-auth", "forced-password-change", "login-throttle", "no-regression"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/src/middleware/auth.ts
  - backend/src/middleware/requireMember.ts
  - backend/src/services/authService.ts
  - backend/src/services/loginThrottleService.ts
  - backend/src/routes/authRoutes.ts
  - backend/src/config/env.ts
  - backend/src/__tests__/memberAuth.test.ts
  - backend/src/__tests__/memberForcedPasswordChange.test.ts
  - backend/src/__tests__/memberLoginThrottle.test.ts
  - backend/src/__tests__/helpers/fixtures.ts
  - frontend/src/types.ts
  - frontend/src/pages/LoginPage.tsx
  - frontend/src/pages/LoginPage.test.tsx
  - frontend/src/pages/member/MemberChangePasswordPage.tsx
  - frontend/src/features/member/memberApi.ts
  - frontend/src/router/ProtectedRoute.tsx
  - frontend/src/router/AppRoutes.tsx
  - frontend/src/components/layout/AppShell.tsx
  - frontend/src/components/layout/RoleAvatar.tsx
  - specs/001-membership-module/tasks.md
  - history/prompts/001-membership-module/0010-member-sign-in-implemented.green.prompt.md
tests:
  - 287 passing - 207 backend across 10 files, 80 frontend across 2
  - the Phase 3 regression suite re-run after the authService edit and still green, including the coordinator fallthrough
  - backend tsc --noEmit clean; frontend tsc -b clean; every new or changed file lints clean, project total unchanged at the pre-existing 68 errors / 4 warnings
  - end-to-end verified against the running server - sign-in, each policy refusal, fresh token on change, old password refused, throttle at 5 with Retry-After, party login unthrottled
  - demo account removed; all 8 real-data row counts identical to the T008 baseline
---

## Prompt

next

(Continuing from the previous turn, which offered Phase 5 — member sign-in, the riskier work
— or Phase 4. Phase 5 was the recommendation, on the grounds that the regression net was
freshest.)

## Response snapshot

Phase 5 complete. **T038 to T057 all closed; 44 of 124 tasks done.** The member role now
signs in, is forced through a password change, and is throttled — with the four existing
roles provably untouched.

### Two requirement conflicts, resolved before writing code

**FR-022 against spec story 3 scenario 3.** FR-022 says sessions established with the old
password must stop working. But the member's *current* token was issued before the change, so
invalidating it would eject them at the exact moment they succeeded — while the story says the
profile opens straight after.

Resolved by having the member change-password response return a **fresh token pair**. Old
sessions die, the member continues seamlessly, and the existing roles' response shape is
untouched. That is also why `memberApi` is a separate slice: the member response carries a
token, the shared one does not.

**Throttling and the password policy are scoped to the member role only.** Applying either to
the existing roles would change their behaviour, which FR-102 to FR-104 forbid — and would have
broken the baseline written last turn, which signs in with a wrong password repeatedly and
expects 401 every time. The type system now helps: `tableForSelfServiceRole` excludes `member`,
so the compiler refuses to route a member through the old path.

### Three bugs found, two of them real

**1. A one-second hole in session invalidation.** The first implementation compared the token's
`iat` against `password_changed_at`. Both have one-second resolution, so a token minted in the
same second as the change compared as "not older" and survived. Narrow, but a real failure of
FR-022.

Fixed by carrying the password-change stamp in the claims as `pwdAt` and comparing it for
**equality** rather than ordering. A stamp either matches the current value or it does not —
no granularity to lose.

**2. The same trap again, in the throttle — and this one was exploitable.** The reset-on-success
boundary was `attempted_at > last_success_time`. A failure landing in the same second as a
success was silently discarded, so six consecutive failures counted as five and an attacker
gained a free attempt simply by being fast. Found by driving the real endpoint with curl, not
by the unit tests, which were too slow per request to collide. Fixed by bounding on
AUTO_INCREMENT `id`, which is exact. A regression test now drives requests back to back
specifically to recreate the collision.

**3. A design flaw the tests exposed.** The per-address counter originally shared one threshold
with the per-account one and reset on the *account's* last success. In the real world that
locks out an entire office behind one NAT after five failures across different people. Split
into separate thresholds — 5 per account, 20 per address — each resetting on its own last
success.

### What the compiler caught

Adding `member` to the `Role` union broke `Record<Role, …>` in two places. `AppShell`'s
`navByRole` was expected; `RoleAvatar`'s `roleLabel` was one I had missed entirely and would
have shipped as a blank role badge. Worth noting as an argument for that exhaustive type over
a looser map.

### The sentinel worked

`LoginPage.test.tsx` carried a deliberate `expect(values).not.toContain("member")`. It failed
the moment the option was added — exactly its purpose — and was then updated deliberately. The
replacement still asserts all four existing entries by value, label, order *and position*, so
the edit is proven to have appended rather than reordered anything.

## Outcome

- Impact: member sign-in, forced first-login password change, the password policy, session invalidation and login throttling all work end to end. Phase 3's regression suite re-run after the `authService.ts` edit and still green, including the coordinator fallthrough test that guards the insertion point.
- Tests: 287 passing, 81 new. Both typechecks clean. Every new file lints clean and the project total is unchanged at the pre-existing 68 errors / 4 warnings.
- Files: 8 created, 13 modified.
- Next prompts: Phase 4 (T027-T037, admin provisioning) or Phase 6 (T058-T082, the profile API and Tabs 1 and 3). Phase 4 is smaller and makes the module usable by real members; Phase 6 is where the UI primitives land.
- Reflection: the same second-granularity mistake appeared twice, in two unrelated places, within one session — once comparing a token age and once resetting a failure count. Both times the fix was to stop comparing times and compare an exact discriminator instead. The second instance was only caught because I drove the real endpoint with curl after the unit tests passed; the tests were too slow per request for the requests to land in the same second. That is a good argument for exercising a finished feature by hand even when the suite is green.

## Evaluation notes (flywheel)

- Failure modes observed: (1) `iat`-versus-timestamp comparison left a one-second window in FR-022 — replaced with an equality check on a claim. (2) The throttle's reset-on-success boundary used a timestamp and undercounted same-second failures, which was exploitable; replaced with a row-id boundary and a regression test that recreates the collision deliberately. (3) The per-address threshold initially matched the per-account one and reset on the wrong key, which would have locked out shared addresses; split into two thresholds resetting independently. (4) Self-inflicted: `memberAuth.test.ts` began failing with 429 once the throttle became exact, because a whole file's deliberate failures come from one address — added a shared `clearMemberLoginAttempts()` reset rather than weakening the throttle. (5) Self-inflicted: added an `err: any` that tripped lint, replaced with a narrowing helper from `unknown`.
- Graders run and results (PASS/FAIL): PASS — 287 tests green; Phase 3 regression suite green after the authService change; both typechecks clean; new files lint clean with the project total unchanged; end-to-end curl run covering sign-in, three distinct policy refusals, the fresh token, the old password being refused, throttling at 5 with a 899s Retry-After, the correct password also refused while throttled, and party login unaffected; demo account removed and all 8 real-data row counts identical to baseline.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): treat any comparison of two timestamps as suspect when an id, a counter or a stored stamp could serve instead. Two bugs in one session shared that single root cause.
