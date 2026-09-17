# Changelog — Claude Migration Baseline

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
