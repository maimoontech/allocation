import { RadioGroup } from "../../../components/ui/RadioGroup";
import { RepeatableRows } from "../../../components/ui/RepeatableRows";
import { Select } from "../../../components/ui/Select";
import { EMPTY_LOOKUP_NOTE, lookupOptions, toNullableId, yearOptions } from "./shared";
import type { TabProps } from "./shared";
import type { AsharaEntry } from "../../../features/member/memberApi";

/** FR-075. The two values exactly as the requirement names them. */
const ATTENDED_WITH = [
  { value: "With Aqa Moula TUS", label: "With Aqa Moula TUS" },
  { value: "With Aamil", label: "With Aamil" }
] as const;

/** FR-076. The upper bound comes from the server, never from the browser. */
const HIJRI_YEAR_MIN = 1400;

/**
 * Tab 9 — Ashara Mubaraka.
 *
 * FR-076: the year list runs from 1400 AH to the current Hijri year, and must not offer a
 * later one. `current_hijri_year` is taken from the lookups response, computed server-side by
 * the same logic that validates the save. Computing it in the browser would mean two
 * implementations that can disagree — and the one the member sees would be the one not
 * enforcing anything.
 *
 * Years already recorded are removed from the other rows' lists: the database holds one
 * record per member per Hijri year, so offering a year twice would only lead to a refusal.
 */
export function Tab09Ashara({ value, lookups, errorFor, onChange, disabled }: TabProps) {
  const records = value.ashara_attendances ?? [];
  const maxHijriYear = lookups.current_hijri_year;

  function yearOptionsFor(row: AsharaEntry) {
    const takenElsewhere = new Set(
      records.filter((r) => r !== row).map((r) => r.hijri_year)
    );
    return yearOptions(HIJRI_YEAR_MIN, maxHijriYear, "Select year...").filter(
      (option) => option.value === "" || !takenElsewhere.has(Number(option.value))
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-textMuted">
        One record for each Ashara Mubaraka you have attended, from 1400 AH to {maxHijriYear}{" "}
        AH.
      </div>

      <RepeatableRows<AsharaEntry>
        legend="Ashara Mubaraka"
        itemNoun="record"
        rows={records}
        onChange={(rows) => onChange("ashara_attendances", rows)}
        newRow={() => ({
          attended_with: "",
          hijri_year: 0,
          moze_id: null,
          mohallah_id: null
        })}
        emptyNote="No Ashara Mubaraka records added yet."
        disabled={disabled}
        rowError={(index) => errorFor(`ashara_attendances[${index}]`)}
        renderRow={(row, index, update) => (
          <div className="space-y-3">
            <RadioGroup
              label="Attended With"
              // One group per record, so the name must differ or the browser treats every
              // record's radios as one set and only the last choice survives.
              name={`attended_with_${index}`}
              options={[...ATTENDED_WITH]}
              value={row.attended_with === "" ? null : row.attended_with}
              onChange={(next) => update({ ...row, attended_with: next })}
              error={errorFor(`ashara_attendances[${index}].attended_with`)}
              disabled={disabled}
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                label="Hijri Year"
                value={row.hijri_year === 0 ? "" : String(row.hijri_year)}
                onChange={(e) => update({ ...row, hijri_year: Number(e.target.value || 0) })}
                options={yearOptionsFor(row)}
                error={errorFor(`ashara_attendances[${index}].hijri_year`)}
                disabled={disabled}
              />

              <Select
                label="Moze"
                value={row.moze_id == null ? "" : String(row.moze_id)}
                onChange={(e) => update({ ...row, moze_id: toNullableId(e.target.value) })}
                options={lookupOptions(lookups.mozes)}
                error={errorFor(`ashara_attendances[${index}].moze_id`)}
                disabled={disabled || lookups.mozes.length === 0}
              />

              {/* FR-077: optional, from the Mohallahs the system already holds. */}
              <Select
                label="Mohallah (optional)"
                value={row.mohallah_id == null ? "" : String(row.mohallah_id)}
                onChange={(e) => update({ ...row, mohallah_id: toNullableId(e.target.value) })}
                options={lookupOptions(lookups.mohallahs, "None")}
                error={errorFor(`ashara_attendances[${index}].mohallah_id`)}
                disabled={disabled}
              />
            </div>
          </div>
        )}
      />

      {lookups.mozes.length === 0 ? (
        <div className="rounded-input border border-warning bg-warning/5 p-2 text-xs text-warning">
          Moze options have not been set up yet. {EMPTY_LOOKUP_NOTE}
        </div>
      ) : null}
    </div>
  );
}
