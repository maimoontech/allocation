# Business Rules — MPSS

## Roles

### Admin
Global administrative role. Current routes allow admin access to management, schedule publishing, reporting and other privileged operations according to route definitions.

### Zonal Head
Zone-scoped role. Backend derives/uses the authenticated user's zone and restricts zone-sensitive operations.

### Party
Party-scoped role. Party users see their own relevant schedule and can perform party-side rating actions.

### Coordinator
Venue-scoped role. Coordinator users work with parties assigned to their venue and submit attendance/performance ratings.

### Member
Self-scoped role. A member reaches their own profile and nothing else.

## Membership

### Member data ownership and isolation

A member's profile belongs to that member. The rules, in the order they matter:

- **The token decides whose data is returned.** No member endpoint takes a member id in its path, query or body. There is nothing to tamper with, which is a stronger guarantee than checking an id against the token — a check can be forgotten on a new endpoint; an absent parameter cannot.
- **A submitted `its_no` is ignored, not honoured and not rejected.** It is read-only and derived from the account, so a member round-tripping their own profile read still saves.
- **Cross-role access is refused.** A member token reaches no admin route, and an admin, party, zonal_head or coordinator token reaches no member-owned route. Both directions return 403.
- **Health values** (blood group, donor status, last donation date, height, weight, BMI) are returned only to the member and to authorised admins, and appear in no export, no error message and no log line.
- **Photographs** are served only through an authenticated endpoint, marked `Cache-Control: private`, and appear in no export and in no profile read.
- **A deactivated account is refused with the same message as a wrong password**, so account state cannot be probed. Its profile data is retained, not deleted.

### Member data retention

**Decided 2026-10-30: deactivate and retain indefinitely.**

When a member leaves, their account is deactivated and all profile data is kept — including
health values, contact details and the photograph. There is no automatic purge and no
expiry date.

What deactivation does:

- The account cannot sign in. The refusal is the same message as a wrong password, so the account's state is not disclosed.
- Every row is retained: profile, titles, sharafs, skills, places visited, Ashara attendances and the photograph (FR-007).
- An existing session stops working: `requireMember` re-reads the account row on every request rather than trusting the token, so deactivation takes effect immediately rather than when the token expires.

The reasoning, recorded because the alternative is reasonable too: this is an organisational
record, and a member who leaves may return or may be the subject of a later question that only
the retained data can answer. Deleting on a timer risks losing a record nobody knew was needed.
The cost is that health data for people no longer involved is held with no end date, which is a
real privacy cost — it is accepted knowingly, not overlooked.

Reversing this later is a deletion, which is straightforward. Reversing an automatic purge is
not possible. That asymmetry is the main argument for starting here.

**Deletion on request is not implemented.** If a departed member asks for their data to be
removed, it is a manual database operation today. If that becomes routine, it should become a
feature rather than a habit.

### Member password rules

Applied to the **member role only**. The four existing roles' password behaviour is
deliberately unchanged — they have no policy today, and imposing one as a side effect of this
module would be a change nobody asked for.

- Provisioned with a temporary password; `must_change_password` is set
- The first sign-in succeeds but reaches only the change-password screen
- Changing the password invalidates every token minted before it, including refresh tokens, and issues a fresh pair so the member is not signed out mid-flow
- Failed sign-ins are throttled per account (5) and per IP (20) in a 15-minute window, counted independently so one shared connection cannot lock out an account and one account cannot lock out a shared connection

### Member profile saving

- One save covers all twelve tabs, in one transaction. A partial write is not reachable.
- An omitted field is left alone; an omitted repeatable section is left untouched; an empty array clears that section.
- A rejected save writes nothing at all, including the parts that were valid.
- `if_unmodified_since` guards against a concurrent edit, returning 409 rather than overwriting.
- Derived values — the Hijri date of birth and BMI — are computed by the server and the database, never accepted from the client.

### Tab 8 consistency

The Number of Times recorded for a place must equal the number of years listed against it. A
save that breaks this is refused, naming the place and both counts. This rule was a proposal
to resolve an ambiguity in the original request, and is recorded as spec assumption 9 — it is
awaiting sign-off.

## Scheduling

The scheduling generator:
- considers active parties
- excludes category `H` from automatic scheduling
- processes categories A/B/C with defined priority ordering
- respects venue minimum and maximum capacity
- uses historical party/venue assignment information
- attempts fair rotation
- avoids immediate/recent venue repetition according to current algorithm
- supports overwrite protection
- uses transactions
- records manual edits separately

Do not change these rules based only on code simplification. The exact algorithm in `scheduleService.ts` is authoritative.

## Schedule Overwrite

If a schedule already exists:
- generation without explicit overwrite returns a conflict
- overwrite removes the relevant schedule scope and regenerates
- zonal heads remain restricted to their own zone

## Publishing

Publishing is a separate operation from generation.

Current route behavior is admin-only and publishes all schedule rows for the selected Miqaat/zone scope.

## Ratings

Two rating contexts exist:
- Party-side mic/audio rating
- Coordinator-side attendance/performance rating

Role restrictions are enforced by backend routes and must remain server-side.

## Manual Schedule Changes

Manual changes:
- update the venue/party assignment
- mark the schedule row as manual
- create an audit/history record in `schedule_edits`

## Data Integrity

Business-critical changes should preserve:
- zone scoping
- role authorization
- schedule history
- published/unpublished state
- rating relationships
- existing assignments unless overwrite/manual edit is explicit

## UI vs Server

The frontend may hide actions based on role, but the backend remains the authoritative enforcement layer.

## Known Business/Technical Ambiguities

Some historical documents contain older or broader requirements than the current implementation. When requirements and code differ:
1. identify the discrepancy
2. state current behavior
3. request/confirm intended behavior before changing a business rule
