import { Select } from "../../../components/ui/Select";
import { EMPTY_LOOKUP_NOTE, lookupOptions, toNullableId } from "./shared";
import type { TabProps } from "./shared";
import type { AqaMoulaPlace, AsharaEntry } from "../../../features/member/memberApi";

const WITH_AQA_MOULA = "With Aqa Moula TUS";
const WITH_AAMIL = "With Aamil";

/**
 * FR-075. The two stored values exactly as the requirement names them, plus "not attended",
 * which is not stored: it is the absence of a record for that year.
 */
const CHOICES = [
  { value: "", label: "Not attended" },
  { value: WITH_AQA_MOULA, label: "With Aqa Moula TUS" },
  { value: WITH_AAMIL, label: "With Aamil" }
] as const;

/**
 * FR-076b. The grid starts at 1405 AH. The server still accepts 1400 to 1404 (FR-076), so a
 * record saved for one of those years is shown as an extra row rather than hidden: a value
 * the member cannot see is a value they cannot correct.
 */
export const ASHARA_GRID_YEAR_MIN = 1405;

/**
 * Tab 9 — Ashara Mubaraka, as one row per Hijri year.
 *
 * Every year from the current Hijri year down to 1405 AH is listed, newest first, and the
 * member answers each one: Not attended, With Aqa Moula TUS, or With Aamil. A year answered
 * "Not attended" has no record at all, so the saved data has the same shape as before: one
 * record per attended year (the database's unique key on member and year still holds).
 *
 * The upper bound is `current_hijri_year` from the lookups response, computed on the server,
 * so the grid gains a row each Hijri year and a browser with a wrong clock cannot widen it.
 *
 * FR-077b: Aqa Moula TUS holds Ashara in one place a year, so "With Aqa Moula TUS" asks
 * nothing more. The place is the "Ashara with Aqa Moula" entry an administrator gave that
 * year, and it is shown, not chosen. The server looks it up again on save and overrides what
 * the client sent.
 *
 * FR-077a still holds: "With Aamil" asks for the member's Moze and optional Mohallah, inline
 * on that row, and changing the answer clears the fields the other answer owns, in the same
 * update.
 */
export function Tab09Ashara({ value, lookups, errorFor, onChange, disabled }: TabProps) {
  // A record without a year cannot be placed on the grid, and the server would refuse it.
  const records = (value.ashara_attendances ?? []).filter((r) => r.hijri_year > 0);
  const maxHijriYear = lookups.current_hijri_year;

  const placeByYear = new Map<number, AqaMoulaPlace>();
  for (const place of lookups.aqa_moula_asharas) {
    if (place.hijri_year != null) placeByYear.set(place.hijri_year, place);
  }

  const years: number[] = [];
  for (let year = maxHijriYear; year >= ASHARA_GRID_YEAR_MIN; year -= 1) years.push(year);
  for (const r of records) if (!years.includes(r.hijri_year)) years.push(r.hijri_year);
  years.sort((a, b) => b - a);

  function save(next: AsharaEntry[]) {
    onChange(
      "ashara_attendances",
      [...next].sort((a, b) => b.hijri_year - a.hijri_year)
    );
  }

  function choose(year: number, choice: string) {
    const others = records.filter((r) => r.hijri_year !== year);
    const current = records.find((r) => r.hijri_year === year);

    if (choice === "") {
      save(others);
      return;
    }
    // Clearing the other answer's fields in the SAME update is the point: left behind, they
    // would be saved against a record whose form never showed them.
    const entry: AsharaEntry =
      choice === WITH_AQA_MOULA
        ? {
            attended_with: WITH_AQA_MOULA,
            hijri_year: year,
            moze_id: null,
            mohallah_id: null,
            aqa_moula_ashara_id: placeByYear.get(year)?.id ?? null
          }
        : {
            attended_with: WITH_AAMIL,
            hijri_year: year,
            moze_id: current?.attended_with === WITH_AAMIL ? current.moze_id : null,
            mohallah_id: current?.attended_with === WITH_AAMIL ? current.mohallah_id : null,
            aqa_moula_ashara_id: null
          };
    save([...others, entry]);
  }

  function update(year: number, patch: Partial<AsharaEntry>) {
    save(records.map((r) => (r.hijri_year === year ? { ...r, ...patch } : r)));
  }

  /** The place to show for a year: the year's own entry, else what an older record saved. */
  function placeNameFor(record: AsharaEntry): string | null {
    const place =
      placeByYear.get(record.hijri_year) ??
      lookups.aqa_moula_asharas.find((p) => p.id === record.aqa_moula_ashara_id);
    if (!place) return null;
    return place.is_draft ? `${place.name} (DRAFT — NEEDS REVIEW)` : place.name;
  }

  // Errors are keyed by the record's position in the array the server received, which is
  // `value.ashara_attendances` as it stands — not the filtered copy.
  const all = value.ashara_attendances ?? [];
  const errorPath = (record: AsharaEntry, field?: string) =>
    `ashara_attendances[${all.indexOf(record)}]${field ? `.${field}` : ""}`;

  const attendedCount = records.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-textMuted">
        <div>
          Mark each Ashara Mubaraka you attended, from {maxHijriYear} AH back to{" "}
          {ASHARA_GRID_YEAR_MIN} AH. Leave the rest as Not attended.
        </div>
        <div className="font-semibold text-textPrimary">
          Attended {attendedCount} {attendedCount === 1 ? "year" : "years"}
        </div>
      </div>

      <div className="rounded-input border border-border">
        <div className="hidden grid-cols-[5rem_minmax(0,auto)_minmax(0,1fr)] gap-3 border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-textMuted sm:grid">
          <div>Year</div>
          <div>Attended</div>
          <div>Where</div>
        </div>

        {years.map((year) => {
          const record = records.find((r) => r.hijri_year === year);
          const choice = record?.attended_with ?? "";
          const rowError = record ? errorFor(errorPath(record)) : undefined;
          const yearError = record ? errorFor(errorPath(record, "hijri_year")) : undefined;
          const withError = record ? errorFor(errorPath(record, "attended_with")) : undefined;

          return (
            <div
              key={year}
              role="group"
              aria-label={`Ashara ${year} AH`}
              className={[
                "grid gap-2 border-b border-border/60 px-3 py-2 last:border-b-0",
                "sm:grid-cols-[5rem_minmax(0,auto)_minmax(0,1fr)] sm:items-center sm:gap-3",
                record ? "bg-primary/5" : ""
              ].join(" ")}
            >
              <div className="text-sm font-semibold">
                {year}
                {year < ASHARA_GRID_YEAR_MIN ? (
                  <span className="ml-1 text-xs font-normal text-textMuted">(earlier)</span>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {CHOICES.map((option) => (
                  <label
                    key={option.value || "none"}
                    className={[
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs",
                      "has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:font-semibold",
                      "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary",
                      disabled ? "cursor-not-allowed opacity-60" : ""
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      // One group per year, so the name must differ or the browser treats
                      // every year's radios as one set and only the last choice survives.
                      name={`ashara_${year}`}
                      value={option.value}
                      checked={choice === option.value}
                      disabled={disabled}
                      onChange={() => choose(year, option.value)}
                      className="h-3.5 w-3.5 accent-primary focus:outline-none"
                    />
                    {option.label}
                  </label>
                ))}
              </div>

              <div className="min-w-0 text-sm">
                {record?.attended_with === WITH_AQA_MOULA ? (
                  placeNameFor(record) ? (
                    <span data-testid={`aqa-moula-place-${year}`}>{placeNameFor(record)}</span>
                  ) : (
                    <span className="text-xs text-textMuted">
                      The place for {year} AH has not been added yet. You can still save this
                      year.
                    </span>
                  )
                ) : record?.attended_with === WITH_AAMIL ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select
                      aria-label={`Moze for ${year} AH`}
                      value={record.moze_id == null ? "" : String(record.moze_id)}
                      onChange={(e) => update(year, { moze_id: toNullableId(e.target.value) })}
                      options={lookupOptions(lookups.mozes, "Moze...")}
                      error={errorFor(errorPath(record, "moze_id"))}
                      disabled={disabled || lookups.mozes.length === 0}
                    />
                    {/* FR-077: optional, from the Mohallahs the system already holds. */}
                    <Select
                      aria-label={`Mohallah for ${year} AH (optional)`}
                      value={record.mohallah_id == null ? "" : String(record.mohallah_id)}
                      onChange={(e) =>
                        update(year, { mohallah_id: toNullableId(e.target.value) })
                      }
                      options={lookupOptions(lookups.mohallahs, "Mohallah (optional)")}
                      error={errorFor(errorPath(record, "mohallah_id"))}
                      disabled={disabled}
                    />
                  </div>
                ) : null}
              </div>

              {rowError || yearError || withError ? (
                <div className="text-xs text-danger sm:col-span-3">
                  {[rowError, yearError, withError].filter(Boolean).join(" ")}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Warn only about a list a record on screen actually needs. */}
      {lookups.mozes.length === 0 && records.some((r) => r.attended_with === WITH_AAMIL) ? (
        <div className="rounded-input border border-warning bg-warning/5 p-2 text-xs text-warning">
          Moze options have not been set up yet. {EMPTY_LOOKUP_NOTE}
        </div>
      ) : null}
    </div>
  );
}
