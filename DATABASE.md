# Database — MPSS

## Engine

MySQL.

Connection implementation:
- `backend/src/db/pool.ts`

Schema source:
- `database/mpss_mysql.sql`

Incremental changes:
- `database/add_party_contact_numbers.sql`
- `database/add_party_its_no.sql`
- `database/add_venue_contact_fields.sql`
- `database/add_venue_location_fields.sql`

## Core Tables

The current application references these core domains:
- admins
- zones
- mohallahs
- parties
- venues
- miqaats
- schedules
- schedule_edits
- performance_ratings
- refresh_tokens

Additional tables/columns may exist in the SQL schema and should be checked before database work.

## Key Relationships

```text
zones
  |
  +--> mohallahs
          |
          +--> venues

zones
  |
  +--> parties

miqaats
  |
  +--> schedules <--> venues
             |
             +------> parties

schedules
  |
  +--> performance_ratings
  |
  +--> schedule_edits
```

## Authentication Data

Role-specific login data is stored in:
- `admins`
- `zones`
- `parties`
- `venues`

Passwords use `password_hash` and are verified with bcrypt.

Refresh sessions use:
- `refresh_tokens.token_hash`
- user role/id
- expiry
- revocation timestamp

## Schedule Data

`schedules` contains assignment records linking:
- Miqaat
- venue
- party

Important flags include:
- `is_manual`
- `is_published`

## Scheduling History

`schedule_edits` stores manual assignment changes for audit/history.

## Ratings

`performance_ratings` stores coordinator-side performance/attendance information and is associated with schedule rows and coordinator identity.

Party mic/audio ratings are handled through the ratings domain; verify exact columns/contracts in `ratingsRoutes.ts` and the schema before making changes.

## Schema Initialization

`backend/src/db/ensureSchema.ts` checks for selected columns and adds them when missing.

This means startup can mutate the database schema. Treat this as an existing mechanism, but do not add arbitrary schema changes there without explicit design approval.

## Database Change Rules

Before any DB change:
1. inspect `database/mpss_mysql.sql`
2. inspect incremental SQL files
3. inspect all code references
4. determine existing data impact
5. create a migration/update script
6. document rollback considerations
7. test against a safe database

Do not assume inferred relationships are foreign keys until confirmed in schema.
