import { Input } from "../../../components/ui/Input";
import { RepeatableRows } from "../../../components/ui/RepeatableRows";
import { Select } from "../../../components/ui/Select";
import { EMPTY_LOOKUP_NOTE, lookupOptions } from "./shared";
import type { TabProps } from "./shared";
import type { PlaceVisitEntry } from "../../../features/member/memberApi";

/**
 * Tab 8 — Maqamaat Muqaddasah (shown to members under that name since 2026-11-05; the code
 * and data still call it places / places_visited).
 *
 * Named Places Visited, never Miqaat: the system already has a `miqaats` table meaning the
 * scheduling calendar of majlis sessions, and reusing the word here caused real confusion
 * (spec assumptions 17 and 18).
 *
 * FR-073 is the rule that shapes this tab. Number of Times must equal the number of years
 * listed, and the server refuses a save that breaks it, naming the place and both counts.
 * Rather than let the member discover that on save, the mismatch is shown on the row as soon
 * as it exists, with a one-click correction — the two numbers are visible side by side, so
 * the member can see which of them is wrong rather than being told only that they disagree.
 *
 * Number of Times stays editable rather than being derived from the year count. The brief
 * asks for both fields, and a member who has visited a place three times but can only
 * remember two of the years needs to be able to say so and be told what is missing.
 */
export function Tab08PlacesVisited({ value, lookups, errorFor, onChange, disabled }: TabProps) {
  const visits = value.places_visited ?? [];

  // Places already chosen cannot be chosen again (FR-071) — one row per place keeps its count
  // and years one coherent record.
  function placeOptionsFor(row: PlaceVisitEntry) {
    const takenElsewhere = new Set(
      visits.filter((v) => v !== row).map((v) => v.place_id)
    );
    return lookupOptions(
      lookups.places.filter((p) => !takenElsewhere.has(p.id) || p.id === row.place_id)
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-textMuted">
        The places you have visited, how many times, and in which years. Add one entry per
        place.
      </div>

      <RepeatableRows<PlaceVisitEntry>
        legend="Maqamaat Muqaddasah"
        itemNoun="place"
        rows={visits}
        onChange={(rows) => onChange("places_visited", rows)}
        newRow={() => ({ place_id: 0, times_count: 0, years: [] })}
        emptyNote="No places added yet."
        addDisabledReason={
          lookups.places.length === 0
            ? `Places have not been set up yet. ${EMPTY_LOOKUP_NOTE}`
            : undefined
        }
        disabled={disabled}
        rowError={(index) => errorFor(`places_visited[${index}]`)}
        renderRow={(row, index, update) => {
          return (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Place"
                  value={row.place_id === 0 ? "" : String(row.place_id)}
                  onChange={(e) => update({ ...row, place_id: Number(e.target.value || 0) })}
                  options={placeOptionsFor(row)}
                  error={errorFor(`places_visited[${index}].place_id`)}
                  disabled={disabled}
                />

                <Input
                  label="Number of Times"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={String(row.times_count)}
                  onChange={(e) =>
                    update({ ...row, times_count: Math.max(0, Number(e.target.value || 0)) })
                  }
                  error={errorFor(`places_visited[${index}].times_count`)}
                  disabled={disabled}
                />
              </div>

              {/* FR-072a. The per-year chips were removed on 2026-11-12. `years` is still
                  carried on the row so anything already recorded survives a save untouched;
                  it is simply no longer asked for, shown, or required to match the count. */}
            </div>
          );
        }}
      />
    </div>
  );
}
