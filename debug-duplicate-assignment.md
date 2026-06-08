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

## Verification Conclusion
- Hypothesis A: Partially rejected for the current local code. The current ranking logic does apply pair visit counts.
- Hypothesis B: Rejected as sole cause. History is present and non-empty, though skewed.
- Hypothesis C: Rejected for the current local code path because the simulated output differs from the stored repeated schedules.
- Hypothesis D: Rejected. The database already contains repeated schedule rows before reporting.
- Most likely current explanation: the user is viewing schedules generated before the fix, or the deployed backend has not yet picked up the current generator logic. Next verification step is redeploy + regenerate with overwrite.
