---
id: 0022
title: Live Database Update Script
stage: green
date: 2026-10-30
surface: agent
model: claude-opus-5
feature: 001-membership-module
branch: 001-membership-module
user: Fakhruddins128
command: (direct request)
labels: ["migration", "release", "generated-artifact", "preflight-guard", "stale-docs"]
links:
  spec: specs/001-membership-module/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - database/membership_live_update.sql
  - database/build_live_update.mjs
  - database/membership_schema.sql
  - database/membership_seed.sql
  - database/membership_rollback.sql
  - backend/src/__tests__/liveUpdateScript.test.ts
  - specs/001-membership-module/quickstart.md
  - DATABASE.md
  - CHANGELOG.md
  - history/prompts/001-membership-module/0022-live-database-update-script.green.prompt.md
tests:
  - 601 passing - 438 backend across 20 files, 163 frontend across 10
  - 8 new tests pinning the generated script to its sources and its guards
  - rehearsed on a throwaway database restored from a production copy - clean install, re-run, and the wrong-database guard
  - production database untouched; nothing executed against it
---

## Prompt

make a database script for update live database

## Response snapshot

`database/membership_live_update.sql` — one self-contained script to apply the module to a live
database. **Nothing was run against production.** It was rehearsed on a throwaway database
restored from a copy of production and rolled back to the pre-module state, then dropped.

### Why one generated file rather than two scripts or a hand-written third

The two approved scripts already existed and were rehearsed. A live run is still better served
by a single file: it runs from any directory, pastes into any client, and can be handed to
whoever holds production access, with no chance of running the two in the wrong order or
forgetting the second. (`SOURCE` would avoid duplication, but it resolves against the client's
working directory — one more thing to get wrong mid-migration.)

The cost is a second copy of 800 lines of DDL, which drifts silently the first time somebody
edits the schema and forgets the copy. So it is **generated** by
`node database/build_live_update.mjs`, carries each source's SHA-256 in its header, and a test
fails when it no longer matches. The convenience of one file does not buy a second source of
truth.

### What the script adds over the raw sources

- **It refuses to run against the wrong database.** A `SIGNAL SQLSTATE '45000'` pre-flight aborts unless `parties` and `zones` exist. Pointing a migration at the wrong schema is the mistake with the worst consequences and the one nobody expects to make. Verified against an empty schema: exits non-zero, with a message naming the problem, and **creates nothing**.
- **BEFORE and AFTER row counts of all 13 existing tables in one output.** "Nothing existing changed" becomes something the operator reads rather than takes on trust. Keep `run.log` and the two blocks sit there to compare.
- Collation, generated-column and empty-lookup checks at the end.
- Idempotent, and it reports how many module tables were already present — 0 on a clean install, 20 on a re-run — so an interrupted run can simply be repeated.

### Rehearsal

On a throwaway `mpss_livetest`, restored from the production copy and then rolled back to 13
tables so it mirrored production exactly:

| Check | Result |
|---|---|
| Wrong-database guard on an empty schema | aborted, exit 1, 0 tables created |
| Clean install | exit 0, 13 → 33 tables, 20 module tables, bmi VIRTUAL, five lists empty |
| BEFORE vs AFTER | identical on all 13 tables |
| Second run (idempotency) | exit 0, still 20 tables, seed counts unchanged — no duplication |
| Throwaway database | dropped; the real local database verified untouched |

### A bug in my own verification output

The first run reported `module_tables_already_present: 10` on a **fully installed** database,
because I had counted with `LIKE 'member\_%'` — which misses the ten lookup tables, whose names
do not begin with "member". On a re-run that reads as a half-finished migration, which is
precisely the moment an operator should not be misled. Replaced with the explicit twenty-table
list: 0 on a clean install, 20 on a re-run, both confirmed.

### Headers that said the opposite of the truth

All three scripts still carried:

```
*** DRAFT — NOT EXECUTED. DO NOT RUN AGAINST PRODUCTION. ***
```

plus, in the schema, a note that the file "deliberately lives under specs/ rather than
database/ so that nothing unapproved sits where it looks runnable". Both stale since T118 moved
them and T119 rehearsed them — and actively misleading to anyone opening the file in order to
run it. Replaced with the rehearsal result, and the rollback header now leads with what it
destroys and the frontend-first ordering.

### Two of my own tests were wrong before the script was

`statementsOnly` exists because two assertions failed on their first run against correct
files: the schema header *explains* the collation rule, and the seed *shows an example*
`INSERT INTO places` for whoever fills that list in. Counting raw text picked up the prose.
Stripping comments first is the difference between a test that checks the SQL and a test that
checks the commentary.

## Outcome

- Impact: there is now one reviewed, rehearsed, self-guarding script to run against the live database, and it cannot silently diverge from the schema it is built from.
- Tests: 601 passing, 8 new. Production untouched.
- Files: 2 created, 6 modified.
- Next prompts: the run itself still needs authorisation (T120), and **step 0 of quickstart §9 matters as much as the SQL** — `backend/dist` is a committed artifact and `npm start` runs it, so a deploy without rebuilding ships a backend with none of this module. Also still unconfirmed: Render's build command, and whether the live site's origin is in the CORS allow-list.
- Reflection: the temptation on "make a database script" was to write one. The two scripts already existed and were already rehearsed, so the honest value was not in more SQL — it was in the guard against the wrong database, the before/after proof in a single output, and making the convenience copy impossible to drift. The detail I would have missed without running it twice was my own `LIKE` pattern reporting a complete install as half-done.
