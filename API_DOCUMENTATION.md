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

Roles:
- admin
- zonal_head
- party
- coordinator

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

### Import/Export
`/api/v1/import-export`

## Health

`GET /health`

Returns service status and build/database identification information. Do not expose additional secrets through this endpoint.

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
