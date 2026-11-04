import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { RepeatableRows } from "../../../components/ui/RepeatableRows";
import { Select } from "../../../components/ui/Select";
import {
  EMPTY_LOOKUP_NOTE,
  PROFILE_HIJRI_YEAR_MIN,
  lookupOptions,
  yearOptions
} from "./shared";
import type { TabProps } from "./shared";
import type { PlaceVisitEntry } from "../../../features/member/memberApi";

/**
 * The years recorded against one place.
 *
 * Chips rather than a stack of row cards: a place can easily have eight or ten years, and ten
 * nested cards inside a card is unreadable. The select offers only years not already chosen,
 * so the duplicate the server rejects (`2019 is listed twice`) cannot be entered at all.
 *
 * Years are Hijri (AH). The list stops at the current Hijri year because a visit cannot have
 * happened in the future, and that ceiling is passed in from the lookups response rather than
 * read off the browser clock — a wrong clock must not widen what the server will accept.
 */
function YearChips({
  years,
  maxHijriYear,
  onChange,
  error,
  disabled
}: {
  years: number[];
  maxHijriYear: number;
  onChange: (years: number[]) => void;
  error?: string;
  disabled?: boolean;
}) {
  const taken = new Set(years);
  const available = yearOptions(PROFILE_HIJRI_YEAR_MIN, maxHijriYear, "Add a year...").filter(
    (option) => option.value === "" || !taken.has(Number(option.value))
  );

  return (
    <div>
      <div className="mb-1 text-sm font-semibold">Years (AH)</div>

      {years.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {[...years]
            .sort((a, b) => a - b)
            .map((year) => (
              <span
                key={year}
                className="inline-flex items-center gap-1 rounded-button border border-border bg-white px-2 py-1 text-xs"
              >
                {year}
                <button
                  type="button"
                  className="text-danger disabled:opacity-50"
                  onClick={() => onChange(years.filter((y) => y !== year))}
                  disabled={disabled}
                  aria-label={`Remove year ${year}`}
                >
                  &times;
                </button>
              </span>
            ))}
        </div>
      ) : (
        <div className="mb-2 text-xs text-textMuted">No years added yet.</div>
      )}

      <Select
        aria-label="Add a year"
        value=""
        onChange={(e) => {
          if (e.target.value === "") return;
          onChange([...years, Number(e.target.value)]);
        }}
        options={available}
        error={error}
        disabled={disabled}
      />
    </div>
  );
}

/**
 * Tab 8 — Places Visited.
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
        legend="Places Visited"
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
          const mismatch = row.times_count !== row.years.length;

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

              <YearChips
                years={row.years}
                maxHijriYear={lookups.current_hijri_year}
                onChange={(years) => update({ ...row, years })}
                error={errorFor(`places_visited[${index}].years`)}
                disabled={disabled}
              />

              {/* FR-073, surfaced here rather than on save. */}
              {mismatch ? (
                <div className="flex flex-wrap items-center gap-2 rounded-input border border-warning bg-warning/5 p-2 text-xs text-warning">
                  <span>
                    Number of Times is {row.times_count} but {row.years.length}{" "}
                    {row.years.length === 1 ? "year is" : "years are"} listed. These must match
                    before you can save.
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    onClick={() => update({ ...row, times_count: row.years.length })}
                    disabled={disabled}
                  >
                    Set to {row.years.length}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        }}
      />
    </div>
  );
}
