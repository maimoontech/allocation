# Changelog — Claude Migration Baseline

## 2026-11-04 — Changed: `database/` reorganised so one file is obviously the one to run

Asked which script to run against live, because the folder held several. It held eleven files,
exactly one of which should ever reach production — and the four most similar names differed by
a single word: `membership_live_update.sql`, `membership_schema.sql`, `membership_seed.sql`,
`membership_rollback.sql`. One installs, one destroys all member data, two are sources that
should never be run directly. That is a hazard, not a naming preference.

No SQL changed. The script applied to a scratch database still produces a schema identical to
the working development database — 192 columns, 70 index columns — verified again after the
move.

- The one file to run is now **`database/MEMBERSHIP_LIVE_INSTALL.sql`**. Uppercase, names the
  action, and sorts to the top of a directory listing. Its header now opens by saying it is the
  only file to run and what each other file is for.
- `database/sources/` holds the two maintained sources, `membership_schema.sql` and
  `membership_seed.sql`, away from the generated output so they cannot be mistaken for it.
- `database/already-applied/` holds the four `add_*.sql` scripts and the superseded
  `membership_schema_update_photo_approval.sql`. These were applied to live long ago — party
  sign-in by ITS Number depends on them and is live, and all 11 of their columns are present —
  so they are history, not pending work. Re-running one now fails with error 1060, since
  `ADD COLUMN` has no `IF NOT EXISTS` in MySQL.
- **`database/README.md`** is new and answers "which file do I run?" in its first line, then
  explains every other file and why it is not the one. `DATABASE.md` points at it.
- `mpss_mysql.sql` stays where it is, now documented as never to be run against live: it resets
  the admin password and declares a collation the real database does not use.

Moves were made with `git mv`, so history follows the files. Live references were updated —
generator, guard test, `DATABASE.md`, `quickstart.md`, the local-dev docs, and the markdown
links in `plan.md` and `tasks.md` that would otherwise have 404'd. Dated CHANGELOG entries and
PHRs were left alone: they record what was true when written.

## 2026-11-04 — Changed: the migration script now matches the running schema

Branch `001-membership-module`. Prepares the membership module for its live apply. No
application code changed; this is the migration script, its seed, and the tests that guard
them.

The script was verified by applying it to a scratch database holding only the 13 pre-existing
tables, then diffing the result against the working development database. It now reproduces it
exactly: **192 columns, 70 index columns, 22 foreign keys and 87 lookup values, all
identical.** Before these changes that diff showed five missing columns, two missing indexes
and six wrong lookup values.

### Fixed: the script created `member_photos` without the approval columns

The photo approval workflow was added to the development database with a standalone
`ALTER TABLE` (`database/membership_schema_update_photo_approval.sql`) and the migration script
was never updated to match. `membership_live_update.sql` would therefore have created a
`member_photos` with no `approval_status`, `approved_by`, `approved_by_role`, `approved_at` or
`rejection_reason`, and every photo approval query on production would have failed with error
1054, unknown column.

`node database/build_live_update.mjs --check` did not catch this: it compares the generated
file against its two sources, and both sources were equally out of date.

- The five columns and their two indexes are now declared in the `member_photos`
  `CREATE TABLE`, in the same column positions the development database has.
- A conditional backfill (`mm_backfill_photo_approval`) adds them to a database that created
  the table before they existed. `CREATE TABLE IF NOT EXISTS` skips an existing table
  entirely, columns and all, so without this a re-run would silently leave such a database
  five columns short while reporting success.
- A new test asserts both, so the next schema change to this table cannot drift the same way.

### Changed: all ten lookup lists ship populated and reviewed

Five lists previously shipped empty because seeding them would have meant inventing Dawoodi
Bohra religious and organisational terms. Those values have since been supplied through the
Member Lists admin screen, so the seed now carries them and a live apply gets the same lists
the module has been used with: `titles` (2), `sharafs` (3), `halqas` (2), `mozes` (5),
`places` (5). This closes **T018**.

`tamreen_methods` changed in substance, not just in flag: the seven values this file once
proposed were **not** adopted. The four real ones are `Self`, `With Party`, `With an Ustad`
and `SatulIman`. Because the unique key is on the name, inserting the four could not have
displaced the seven — a database that received the earlier seed would have offered members all
eleven. Section 4b of the seed deactivates the six rejected names with `is_active = 0` rather
than deleting them, so they leave the pickers while any profile that referenced one stays
readable.

Every seeded value now ships `is_draft = 0`, and `is_draft` is written on conflict. That
reverses an earlier, deliberate choice not to touch the flag — correct while the file shipped
drafts, since writing it could only ever re-flag something a human had approved. Now that
every value ships reviewed, writing it can only ever *clear* the flag, and not writing it
caused the bug it was meant to prevent: a value in both lists, such as `With an Ustad`, would
have kept `is_draft = 1` forever and gone on displaying `DRAFT — NEEDS REVIEW`.

### Changed: the additive-only test now asserts the actual rule

It asserted that `membership_schema.sql` contains no `ALTER`, `UPDATE`, `DELETE` or
`TRUNCATE` at all — a convenient proxy for FR-106 while that happened to be true, and no
longer true now the schema backfills a column and the seed deactivates six values. Both target
tables this module owns, which FR-106 has nothing to say about: it governs the 13 tables that
were here first.

The proxy is replaced by the rule itself, which is also stricter: every mutating statement in
either source is parsed for its target table, and that target must be one of the 20 module
tables and must not be one of the 13 pre-existing ones.

### Verified

- Fresh apply to a scratch database, then re-apply: identical counts, no errors, no leftover
  stored procedures.
- Upgrade path: a database regressed to the old shape (approval columns dropped, old seven
  `tamreen_methods` restored) is healed by one run — 5 columns and 2 indexes restored, the four
  adopted methods active and reviewed, the six rejected ones deactivated.
- `membership_rollback.sql` against the updated schema: 33 tables down to the 13 pre-existing,
  no membership table or procedure left behind.
- 461 backend tests, 175 frontend tests, both typechecks clean, both builds clean.

## 2026-10-30 — Membership module: member login and the twelve-tab member profile

Branch `001-membership-module`. **Not yet released to production.** Specification, plan,
tasks, data model and migration scripts are under `specs/001-membership-module/`.

### Added

A fifth role, `member`, signing in with an ITS Number and a password, reaching exactly one
thing: their own profile. Accounts are provisioned by an admin from a roster through the
existing CSV import path; the first sign-in forces a password change before the profile is
reachable.

The profile is one responsive page of twelve tabs — Personal, Title & Prefix, Hizb,
Occupation, Education/Hifz, Health & Fitness, Sharaf, Places Visited, Ashara Mubaraka, Asbaq,
Tamreen, Other Sansta Khidmat — saved in one transaction.

New endpoints under `/api/v1/members`: profile read and save, photo get/put/delete, a single
lookups response, and admin account listing and activation. See `API_DOCUMENTATION.md`.

**Twenty new database tables, nothing altered or dropped.** `zones`, `parties` and
`mohallahs` are reused as they are. The scripts are `database/membership_schema.sql`,
`database/membership_seed.sql` and `database/membership_rollback.sql`; none of it runs through
`ensureSchema.ts`. See `DATABASE.md` for the table list and the two conventions that are easy
to get wrong (explicit `utf8mb4_general_ci` on every table, and `bmi` being a generated
column that rejects writes).

### Added: admin maintenance of the member dropdown lists

**Member Lists** in the admin navigation (`/member-lookups`), backed by
`/api/v1/member-lookups`. All ten lookup lists the member profile depends on — Titles, Sharaf,
Halqas, Mozes, Places Visited, Hifz Sanads, Marital Statuses, Tamreen Frequencies, Tamreen
Methods, Skills — with add, edit, reorder, activate/deactivate, and a one-click "mark reviewed"
that clears the `DRAFT — NEEDS REVIEW` warning members see on seeded starter values.

This is what closes the gap that five lists shipped empty: the values can now be entered by
someone who knows them, with no developer and no SQL.

**Deleting a value in use is refused**, for all ten lists, with a message saying how many
member records use it and to deactivate instead. This does not delegate to the database on
purpose: five of the ten foreign keys are `ON DELETE SET NULL`, so for half of these lists the
database would have allowed the delete and silently blanked that answer on every member who had
chosen it. The UI withholds the Delete button entirely for a value in use, rather than offering
an action that will fail.

### Security

- **Login throttling, which did not previously exist anywhere.** Applied to the member role
  **only**: 5 failed attempts per account and 20 per IP in a 15-minute window, counted
  independently so a shared connection cannot lock out an account and one account cannot lock
  out a shared connection. Client IPs are stored as salted SHA-256 hashes, never in the clear.
  The four existing roles' login path is unchanged.
- **A password policy, also member-only.** The existing roles have no policy today and
  imposing one as a side effect of this module would be a change nobody asked for.
- Changing a member's password invalidates every token minted before it, including refresh
  tokens, and returns a fresh pair so the member is not signed out mid-flow. The access token
  carries a `pwdAt` claim compared for equality, because `iat` and `password_changed_at` are
  both second-resolution and an ordering comparison lets a token minted in the same second
  survive the change.
- Member photos are stored in the database and served only through an authenticated endpoint
  marked `Cache-Control: private`. Uploads are validated on magic bytes rather than the
  declared content type, and capped at 2MB.
- Health values and photographs appear in no export, no error message and no log line. The
  backend contains no `console.*` call outside its tests, and a test now asserts that.
- Text and numeric inputs are bounded to their storage widths, so an over-long value is a
  named field error rather than a database failure returned as a generic 500.

### Fixed: a disallowed CORS origin returned 500

A browser calling from an origin outside the allow-list hit
`callback(new Error("CORS_NOT_ALLOWED"))`, which `cors` hands to Express, which routed it to the
terminal handler as **"Internal server error"**. Wrong twice: nothing had failed on the server,
and the message gave nobody a way to fix it. It now returns 403, naming the origin and the
variable to add it to.

`http://127.0.0.1:5173` added to the default allow-list alongside `http://localhost:5173`. A
browser treats them as different origins and Vite serves both.

Why this was hard to find: curl sends no `Origin` header, so the check never fired and the
endpoint looked healthy from the command line. And a browser sends `Origin` on a POST even
same-origin, but not on a same-origin GET — so pages loaded fine and only *signing in* failed,
which presented as an authentication bug.

The CORS options and the terminal error handler moved from inline in `server.ts` to
`middleware/httpBoundary.ts`. They were the only middleware with no tests, because `server.ts`
binds a port at module scope and cannot be imported from a test. Both are now covered.

### Added: traceable 500s

Every HTTP 500 now carries a short reference (`data.ref`, and in the message), with exactly one
matching stderr line: the reference, method, path, driver error code and error class. Nothing
more — no message, no SQL, no stack, no request body, because a `mysql2` error carries the
values it was writing and those can include health data.

This replaced a bare `"Internal server error"` that two unrelated faults produced identically,
which made a real user report untraceable. Asking for the reference now identifies the exact
failure; `ER_NO_SUCH_TABLE` on a named route, for instance, is a complete diagnosis.

`requireMember` no longer answers its own 500 — it hands the error to the terminal handler, so
there is one path and one format.

### Changed

- `POST /api/v1/auth/login` accepts `role: "member"`. The member branch sits **above** the
  unguarded venue/coordinator fallthrough in `authenticate()`, so it cannot affect the four
  existing roles.
- `POST /api/v1/auth/change-password` accepts the member role, with its own branch.
- The login page has a Member option. Party login is untouched.
- `POST /api/v1/auth/refresh` is now actually called: the frontend gained a 401
  refresh-and-retry interceptor. It existed on the server but no client ever used it, so a
  session long enough to fill in twelve tabs could expire mid-save and strand unsaved work
  behind a login screen.

### Tests

**The project previously had no test runner and no tests at all.** This branch adds Vitest to
both packages, 16 backend suites and 10 frontend suites. The backend suites include a
regression net for the four existing roles' sign-in and password paths, written and verified
*before* the member branch was added, so "Party login still works exactly as it does now" is
a checked claim rather than an assertion.

### Added: one script for the live database update

`database/membership_live_update.sql` — a single self-contained script for applying the module
to a live database, generated from `membership_schema.sql` and `membership_seed.sql` by
`node database/build_live_update.mjs`. It carries each source's SHA-256 and a test fails if it
drifts, so the convenience of one file does not create a second source of truth.

What it adds over running the two sources by hand:

- **It refuses to run against the wrong database.** Aborts with SQLSTATE 45000 unless `parties` and `zones` exist, before creating anything. Verified: run against an empty schema it exits non-zero and creates nothing.
- **BEFORE and AFTER row counts** of all 13 existing tables in one output, so "nothing existing changed" is something the operator reads rather than takes on trust.
- Collation, generated-column and empty-lookup checks at the end.
- Idempotent, and it reports how many module tables were already present, so an interrupted run can be repeated and resumed.

Rehearsed on a throwaway database restored from a production copy and rolled back to the
pre-module state: clean install, a second run, and the wrong-database guard. Every BEFORE
figure matched its AFTER.

Also corrected: the three scripts' headers still said
`*** DRAFT — NOT EXECUTED. DO NOT RUN AGAINST PRODUCTION. ***` and that they lived under
`specs/`. Both stale since the scripts were approved, moved and rehearsed — and actively
misleading to anyone opening the file to run it.

### Release note: the committed backend build artifact

`backend/dist` is a **committed** build artifact and `npm start` runs `node dist/server.js`,
so whatever is in `dist` at deploy time is what production runs. It has been rebuilt on this
branch (`cd backend && npm run build`). Without that rebuild the deploy would have shipped the
previous build and the membership module would have been **entirely absent from production** —
the login page offering Member while every `/api/v1/members` route returned 404.

Verified by running `node dist/server.js` and confirming `/api/v1/members/lookups` answers 401
rather than 404. `frontend/dist` needs no equivalent step: it is gitignored and built by Vercel.

Still unconfirmed: whether Render's build command runs `npm run build`. If it does, the commit
is belt-and-braces; if it does not, it is the difference between a release and a silent no-op.

### Outstanding before release

- The spec's 18 assumptions need sign-off; items 5 to 18 are proposals.
- ~~Five lookups — `titles`, `sharafs`, `halqas`, `mozes`, `places` — ship **empty**.~~
  **Resolved 2026-11-04.** All ten lookup lists are now seeded with reviewed values; see
  "Changed: the migration script now matches the running schema" below.
- ~~Everything seeded except `sanads` is marked `is_draft = 1`.~~ **Resolved 2026-11-04** —
  every seeded value now ships `is_draft = 0`. The flag still governs values an admin adds
  later, which default to `1` and display as `DRAFT — NEEDS REVIEW` until signed off.
- `GET /api/v1/import-export/database-backup` builds its whole dump as one in-memory string,
  and `mysql.escape` renders a BLOB as hex, roughly doubling it. With photo blobs in the
  database this scales badly; it should stream. Not changed in this branch.

### Decided

- **Member data retention: deactivate and retain indefinitely.** A departed member's account
  is deactivated and all profile data is kept, with no automatic purge. The privacy cost of
  holding health data with no end date is accepted knowingly; the alternative risks losing a
  record nobody knew was needed, and is not reversible. Deletion on request is a manual
  database operation today. See `BUSINESS_RULES.md`.
- **The admin database backup is authorised to contain everything** (FR-101a), including
  health values and photographs. A backup that omits tables cannot restore the system. FR-101
  continues to apply in full to the CSV entity exports and to reports.

## 2026-09-17 — Fixed `.env` lookup depending on the working directory

Follow-up to the 2026-09-13 credential change.

`dotenv.config()` resolves `.env` against `process.cwd()`, so starting the backend from
the repository root (rather than from `backend/`) found no file and aborted with
`Missing required environment variable(s): ...` even though `backend/.env` was present
and complete. The old hardcoded fallbacks had masked this; removing them exposed it.

- `backend/src/config/env.ts` now resolves `backend/.env` from the module's own location
  (`__dirname/../..`, which is the backend package root for both `src/` under tsx and the
  compiled `dist/`), so the load no longer depends on where the process was started.
- Real environment variables still take precedence — dotenv does not overwrite values
  already present in `process.env`, so deployed configuration is unaffected.
- The startup error now names the exact path that was checked and whether a file was found.

Verified loading from the repository root, `backend/`, an unrelated directory and a
different drive root; and verified that a genuinely missing `.env` still aborts startup.
`npm run dev:backend` was already unaffected, as `npm run --prefix backend` changes the
working directory.

## 2026-09-13 — Removed hardcoded credentials from source

### Security
Resolved the finding recorded as item 3 in the 2026-09-12 baseline below.

`backend/src/config/env.ts` previously supplied the live database host, name, user and
password, plus a `change_me` JWT secret, as fallback defaults. Any checkout of the
repository exposed working production credentials, and an unset `JWT_SECRET` in a
deployed environment would have signed tokens with a publicly known value.

Changes:
- `requireEnv` no longer accepts a fallback. `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`
  and `JWT_SECRET` are mandatory; startup aborts listing every missing variable at once.
- Non-secret settings (`PORT`, `DB_PORT`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN_DAYS`,
  `CORS_ALLOWED_ORIGINS`) keep their previous defaults via a separate `optionalEnv` helper,
  so effective behaviour is unchanged when the variables are set.
- Startup rejects known placeholder JWT secrets and warns when the secret is under 32 characters.
- Added `backend/.env.example` documenting every variable. `backend/.env` stays gitignored.
- 14 `tmp_*.js` debug scripts embedded their own copies of the credentials; they now read
  `env.db.*` from `./dist/config/env`, matching the scripts that already did so.
- Rebuilt `backend/dist` so the committed build no longer carries the values.
- Redacted the database host from `debug-schedule-duplicates.md`.

### Required follow-up (not performed here)
1. **Rotate the database password and the admin account password.** The old values remain
   in Git history and must be assumed compromised.
2. **Set the five required variables in the backend hosting environment before the next
   deploy.** The service will not start without them.
3. Setting a new `JWT_SECRET` invalidates all issued access tokens; every user must log in
   again. The frontend does not refresh tokens automatically, so this surfaces as a forced logout.

## 2026-09-12 — Claude Code Context Baseline

Created a Claude-oriented project context based on the supplied Trae AI project.

### Current Stack
- React 18 + TypeScript + Vite
- Redux Toolkit
- React Router
- Tailwind CSS
- Node.js + Express + TypeScript
- MySQL2
- JWT + bcryptjs

### Current Domains
- Authentication
- Zones
- Mohallahs
- Parties
- Venues
- Miqaats
- Schedules
- Reports
- Ratings
- Import/Export

### Existing Documentation
The project already contains developer, process, UI/UX and user documentation under `Documentation/`.

### Important Existing Work
The repository contains substantial scheduling logic and historical debugging artifacts around duplicate assignments/schedule generation. Preserve these when working on scheduling.

### Known Technical Findings
1. Current source uses MySQL2 directly, while older documentation mentions Prisma.
2. `ensureSchema.ts` can alter selected database columns during startup.
3. Environment configuration contains fallback credential/secret values in source; this is a security risk and should be addressed deliberately.
4. Generated `dist` directories are present; source under `src` should be treated as the editable source.
5. Temporary/debug scripts are present under the backend and should not be removed without checking their purpose.

### Migration Rule

This baseline documents the existing system. It does not authorize fixes to the above issues. Fixes must be separately requested/planned and tested.
