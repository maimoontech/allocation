# Debug Session: schedule-duplicates [OPEN]

## Symptom
- Schedule generation still creates duplicate party-to-venue assignments before a party has covered all active venues in the selected zone.
- This is reproducible on production data for `Hyderi` across miqaats `2-8`.

## Current Facts
- Render `/health` reports:
  - `version=1.0.0`
  - `build=cd975229dc81485a3824e0efd934c42a3b31dda2`
  - `db_host=64.20.33.10`
  - `db_name=masjid_scheduling`
- Local `git rev-parse HEAD` matches the same commit hash.
- Current saved data still shows `13` duplicate-rule violations.
- Each affected miqaat currently has `19` assignments and `19` unique parties.

## Hypotheses
1. The generation route is not executing the current `scheduleService.ts` path at runtime.
2. The matching algorithm can still assign a blocked venue because reassignment during seat matching bypasses the intended coverage gate.
3. The current-cycle coverage reconstruction from prior schedules is incorrect for same-date / ordered miqaats.
4. The no-repeat rule is satisfied in candidate generation but later violated when matched seats are materialized into final assignments.
5. The production bug is reproducible locally against the same DB, which means we can isolate it with runtime instrumentation only.

## Plan
- Start a dedicated debug log server.
- Reproduce one concrete miqaat generation locally against the production DB snapshot.
- Capture runtime evidence from the existing instrumentation points in `scheduleService.ts`.
- Confirm or reject the hypotheses above before changing any business logic.

## Notes
- No business-logic changes in this session until runtime evidence is collected.

## Evidence Collected
- `miqaats.english_date` is returned by MySQL as a JS `Date` object, not a plain `YYYY-MM-DD` string.
- Pre-fix runtime sample:
  - `String(english_date)` for miqaat `5` becomes `Thu Jun 18 2026 00:00:00 GMT+0500 (Pakistan Standard Time)`.
  - Using that value in the prior-history SQL filter returned `matched prior ids = []` for a party that definitely has earlier miqaats.
- This falsifies hypotheses `1`, `2`, and `4` as primary causes.
- This confirms hypothesis `3`: the current-cycle coverage reconstruction is fed by a broken prior-miqaat filter because the date parameter format is wrong.

## Fix Applied
- Changed `scheduleService.ts` to read the current miqaat date as `DATE_FORMAT(english_date, '%Y-%m-%d')`.
- This preserves the intended SQL comparison semantics for:
  - `q.english_date < ?`
  - `q.english_date = ? AND q.id < ?`

## Verification
- Backend diagnostics: clean.
- Backend build: pass.

## Next User Verification
- Redeploy backend.
- Regenerate Hyderi miqaats with `Overwrite Existing = Yes`.
- Confirm whether duplicate venue reuse before full coverage is gone.
