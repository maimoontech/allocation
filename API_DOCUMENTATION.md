# API Documentation — Current Source Baseline

## Base

API resources are mounted under:

`/api/v1`

## Authentication

Authentication and authorization are implemented through:
- `backend/src/routes/authRoutes.ts`
- `backend/src/services/authService.ts`
- `backend/src/middleware/auth.ts`

JWT claims include:
- role
- user id
- optional zoneId
- optional partyId
- optional venueId
- optional memberId
- optional pwdAt — the member's `password_changed_at` as an epoch second, so a token minted
  before a password change is rejected after it (FR-022). Compared for equality, not
  ordering: `iat` and `password_changed_at` are both second-resolution, so a token minted in
  the same second as the change would otherwise survive it.

Roles:
- admin
- zonal_head
- party
- coordinator
- member — ITS Number and password, used only for member sign-in. The four roles above are
  unchanged; the member branch sits above the venue/coordinator fallthrough in
  `authenticate()`, so it cannot affect them.

## Resource Groups

### Auth
`/api/v1/auth`

See `backend/src/routes/authRoutes.ts` for the exact current endpoints including login, refresh, logout and password operations.

### Zones
`/api/v1/zones`

### Mohallahs
`/api/v1/mohallahs`

### Parties
`/api/v1/parties`

### Venues
`/api/v1/venues`

### Miqaats
`/api/v1/miqaats`

### Schedules
`/api/v1/schedules`

Important operations include:
- list schedules
- generate schedules
- publish schedules
- delete schedules
- manually edit schedule assignments

### Reports
`/api/v1/reports`

### Ratings
`/api/v1/ratings`

### Members
`/api/v1/members`

Member-owned, member role only. The member's own identity comes from the token; no endpoint
takes a member id, which is what makes cross-member access impossible rather than merely
checked (FR-097, FR-098).

- `GET /api/v1/members/me/profile` — the whole twelve-tab profile in one response
- `PUT /api/v1/members/me/profile` — partial update; an omitted field is left alone, an
  omitted repeatable array leaves its section untouched, and `[]` clears it. One transaction
  covers every section (FR-030). Takes `if_unmodified_since` and returns 409 on a concurrent
  edit. Validation failures return 400 with `errors: [{ tab, field, message }]`, so the UI can
  open the tab that needs attention (FR-029).
- `GET /api/v1/members/me/photo` — the stored bytes, `Cache-Control: private`, ETag supported.
  Requires the bearer token, so an `<img src>` cannot reach it (FR-090).
- `PUT /api/v1/members/me/photo` — base64 payload, validated on magic bytes rather than the
  declared type; 2MB cap returns 413 (FR-088, FR-089)
- `DELETE /api/v1/members/me/photo`
- `GET /api/v1/members/lookups` — every list the form needs in one response, including
  `current_hijri_year` computed server-side so the browser never decides the Tab 9 bound

Admin-only, same base path:

- `GET /api/v1/members` — account list; no profile, health or photo data
- `PATCH /api/v1/members/:id` — activate, deactivate, or reset to a temporary password

### Member Dropdown Lists
`/api/v1/member-lookups`

Admin-only maintenance of the ten lookup lists the member profile draws its dropdowns from:
`titles`, `sharafs`, `halqas`, `mozes`, `places`, `sanads`, `marital_statuses`,
`tamreen_frequencies`, `tamreen_methods`, `skills`.

- `GET /api/v1/member-lookups` — all ten with total / active / draft counts and a line saying where each is used
- `GET /api/v1/member-lookups/:entity` — the values, each with an `in_use` count
- `POST /api/v1/member-lookups/:entity` — `{ name, display_order?, is_active?, is_draft? }`. A value an admin types is authoritative, so `is_draft` defaults to **0** here, unlike the seeded rows. A duplicate name returns 409.
- `PATCH /api/v1/member-lookups/:entity/:id` — partial; any of the four columns
- `DELETE /api/v1/member-lookups/:entity/:id` — **refused with 409 if the value is in use**, carrying `{ in_use: n }`

The delete refusal is the part worth knowing. Five of the ten foreign keys are
`ON DELETE RESTRICT`, but the other five are `ON DELETE SET NULL` — for those the database
would allow the delete and silently blank that answer on every member who had chosen it. The
API therefore counts references itself, across *every* referencing column (`tamreen_frequencies`
is referenced twice), and refuses for all ten lists. Deactivating (`is_active = 0`) is the safe
alternative: `GET /members/lookups` filters on `is_active`, so the value stops being offered
while existing answers are kept.

A separate base path from `/api/v1/members` on purpose — that path is already shared by the
member-owned routers and an admin-only router, and adding a third set of rules to that overlap
is how a 403-on-your-own-profile bug returns.

Mount order matters: the member routers are registered before the admin router on the shared
`/api/v1/members` base. Were the admin router first, its `requireRole(["admin"])` would 403 a
member reading their own profile.

The full contract is in
`specs/001-membership-module/contracts/member-api.openapi.yaml`.

### Extended existing endpoints

Two existing endpoints gained member behaviour without changing their contract for any
existing caller:

- `POST /api/v1/auth/login` — accepts `role: "member"`. Per-account and per-IP throttling
  applies to the member role **only** (5 per account, 20 per IP, 15-minute window), so the
  four existing roles' login behaviour is byte-for-byte unchanged.
- `POST /api/v1/auth/change-password` — accepts the member role. Unlike the existing roles it
  returns a **fresh token pair**, because the member's previous token is invalidated by the
  change itself (FR-022) and the member would otherwise be signed out mid-flow.
- `POST /api/v1/import-export/members/import` and `/export` — member account provisioning
  through the existing CSV path. The export carries no profile, contact, health or photo data
  (FR-101). The template names `its_no,member_name,password,is_active`, but only `its_no` and
  `password` are required columns: a two-column roster imports as-is, leaving `member_name`
  NULL and `is_active` at 1.

### Import/Export
`/api/v1/import-export`

## Health

`GET /health`

Returns service status and build/database identification information. Do not expose additional secrets through this endpoint.

## CORS

The allow-list is `CORS_ALLOWED_ORIGINS` (comma-separated). Unset, it defaults to the two
production origins plus **both** `http://localhost:5173` and `http://127.0.0.1:5173` — a
browser treats those two as different origins and Vite serves both, so allowing only one of
them breaks whichever address the developer happens to type.

A request with no `Origin` header (curl, a health check, anything server-to-server) is always
allowed; there is no CORS to apply.

A browser calling from an origin that is not allow-listed gets **403**, naming the origin and
the variable to add it to. It is not a 500 and leaves no error reference, because nothing failed
on the server.

The trap worth knowing: **a browser sends `Origin` on a POST even when it is same-origin, but
not on a same-origin GET.** So a missing origin shows up as pages loading normally and only
sign-in failing — which looks exactly like an authentication bug and is not one.

## Error References

Every HTTP 500 carries a short reference, in the message and in `data.ref`:

```json
{ "success": false, "data": { "ref": "a5998dab" }, "message": "Internal server error (ref a5998dab)" }
```

One line goes to stderr for that failure, and only this:

```
[error a5998dab] GET /api/v1/members/me/profile code=ER_NO_SUCH_TABLE name=Error
```

The reference, method, path, driver error code and error class — never the message, never
`err.sql`, never a stack, never a request body. `mysql2` interpolates named placeholders
client-side, so a failed query carries the values it was writing on the error object, health
values included (FR-066); a code such as `ER_NO_SUCH_TABLE` names the fault without quoting any
of it.

**When a user reports an error, ask for the reference.** It identifies their exact failure and
the one log line that explains it. Before this existed, every 500 produced the same opaque
string and two unrelated faults were indistinguishable.

## Response Convention

The backend uses response helpers in:
`backend/src/utils/response.ts`

Current API responses generally use a consistent success/data/message structure, with route-specific error status codes.

## Schedule API Business Constraints

Schedule generation:
- requires authentication
- allowed for admin and zonal_head
- requires Miqaat and zone identifiers
- has overwrite protection
- can return HTTP 409 when a schedule already exists and overwrite is not requested
- zonal_head is constrained to their zone

Publishing:
- admin-only in current route
- requires Miqaat and zone
- publishes the selected scope

Manual editing:
- admin/zonal_head
- zonal_head is restricted to their own zone
- edits are marked manual
- edit history is recorded in `schedule_edits`

## API Change Procedure

When changing an API:
1. inspect the route
2. inspect middleware
3. inspect SQL/service logic
4. search all frontend callers
5. preserve backward compatibility unless explicitly requested
6. update this document with the exact contract
7. run frontend/backend checks
