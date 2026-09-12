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
