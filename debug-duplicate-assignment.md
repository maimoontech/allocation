# Debug Session: duplicate-assignment
- **Status**: [OPEN]
- **Issue**: Schedule generation is still producing duplicate party-to-venue assignments across miqaats.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-duplicate-assignment.ndjson

## Reproduction Steps
1. Generate schedule for one miqaat for the affected zone.
2. Generate schedule for the next miqaat for the same zone.
3. Open the multi-miqaat schedule report and compare venue-party assignments across miqaats.
4. Observe repeated pairings that should have rotated based on prior visits.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Generator still selects the same pairings because candidate ranking ignores real pair visit counts during runtime. | High | Medium | Pending |
| B | `party_venue_history` for the affected zone is incomplete or skewed, so the generator sees low-information history and repeats assignments. | High | Low | Pending |
| C | The candidate order tie-break is deterministic enough that equal visit counts still recreate the same full schedule. | Medium | Medium | Pending |
| D | The repeated rows are introduced in report fetch/grouping rather than in stored `schedules` rows. | Low | Low | Pending |
| E | Overwrite/regeneration flow is not clearing or recreating zone+miqaat data the way we expect. | Low | Medium | Pending |

## Log Evidence
- Instrumentation added to `backend/src/services/scheduleService.ts` for history snapshot, candidate ranking, and assignment result.
- Read-only DB inspection confirmed existing stored schedules for miqaats `2`, `3`, and `4` in zone `2` are identical.
- Read-only simulation of the current generator against the same live `party_venue_history` produced a different assignment set, which means the current local code path does not reproduce the old repeated schedule.
- Direct rule check against live history found 5 parties violating the required rule: they repeat at previously visited venues while still having unvisited active venues in the same zone.
- Fix applied: candidate selection now rejects a repeated venue for a party unless that party has already covered all active venues.
- Post-fix read-only simulation produced no rule violations.
- New evidence: under the strict no-repeat rule, a valid assignment for all 19 active parties exists with current live history (`MAX_MATCHING=19`), so the reduced 16-party result was an algorithm failure, not a data limitation.
- Intermediate fix using hard per-category/per-phase matching still stranded parties and only reached 15 assignments.
- Final fix replaces greedy/per-phase allocation with a global seat-matching allocator that:
  - represents each venue slot as an ordered seat by round,
  - keeps one party per miqaat,
  - rejects illegal repeated venue visits until all active venues are covered,
  - and reaches all 19 assignments in read-only simulation with zero rule violations.
- User clarified an additional hard rule for the first pass: every venue should receive Category `A` first when enough `A` parties exist; only after `A` is exhausted should round-1 venues fall back to `B`, then `C`.
- Live zone counts confirm this is feasible for the affected zone: `7` active venues, `19` active parties, categories `A=8`, `B=7`, `C=4`, `min_total=10`, `max_total=22`.
- Final staged fix now performs:
  - round-1 seed matching in `A -> B -> C` order,
  - minimum-capacity fill next in `A -> B -> C` order,
  - remaining optional capacity fill last,
  - while preserving the no-repeat-before-full-coverage rule.
- Read-only staged simulation after this change still assigns all `19` parties, seeds all `7` round-1 venues with `A`, and reports zero rule violations.
- User reported the issue still reproduced after regenerating all `7` Hyderi miqaats.
- New database evidence showed the real remaining defect: although each party had `7` assignments, many parties had only `2-6` distinct venues across those `7` miqaats.
- Root cause refinement: the allocator was using **lifetime** `party_venue_history` to decide whether repeats were allowed. If a party had completed venue coverage in older history, the current 7-miqaat run could repeat venues immediately.
- Final fix now derives a **current cycle coverage set** for each party from prior miqaats in chronological order and resets that set only after all active venues have been covered in the current cycle.

## Verification Conclusion
- Hypothesis A: Partially rejected for the current local code. The current ranking logic does apply pair visit counts.
- Hypothesis B: Rejected as sole cause. History is present and non-empty, though skewed.
- Hypothesis C: Confirmed for the old algorithm behavior relative to the business rule. Minimizing visit count alone still allows illegal repeats before full venue coverage.
- Hypothesis D: Rejected. The database already contains repeated schedule rows before reporting.
- Root cause: there were two distinct scheduling bugs. First, the generator was greedy and venue-first. Second, repeat eligibility was based on lifetime history instead of the party's current venue-coverage cycle across prior miqaats.
- Current fix status: local backend build passes, and the repeat gate now uses current-cycle venue coverage derived from prior miqaats rather than lifetime history.
- Next verification step is redeploy + regenerate with overwrite for the affected miqaats, then compare the new schedule/report output.
