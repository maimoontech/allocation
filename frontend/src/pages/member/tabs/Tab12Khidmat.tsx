import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import {
  PROFILE_HIJRI_YEAR_MIN,
  enumOptions,
  lookupOptions,
  toNullableId,
  yearOptions
} from "./shared";
import type { TabProps } from "./shared";

/** FR-085. */
const KHIDMAT_TYPES = ["Sansta", "Umoor", "Both"] as const;

/**
 * Tab 12 — Other Sansta Khidmat.
 *
 * FR-086: which name fields appear follows the Khidmat type — Sansta shows one, Umoor the
 * other, Both shows both. Switching type clears whichever name no longer applies, in the
 * same update, so a value cannot linger out of sight and then be saved against a type that
 * does not want it.
 *
 * `Since` is a YEAR, not a full date (spec assumption 8). It is Hijri (AH), unlike the Since
 * Year on Tab 4, which is still Gregorian — only the five fields named in the request moved.
 * That assumption is still awaiting sign-off.
 */
export function Tab12Khidmat({ value, lookups, errorFor, onChange, disabled }: TabProps) {
  const type = value.khidmat_type;
  const showSansta = type === "Sansta" || type === "Both";
  const showUmoor = type === "Umoor" || type === "Both";

  function onTypeChange(raw: string) {
    const next = raw === "" ? null : raw;

    // Clear whichever name the new type does not use, together with the change itself —
    // both the chosen id and the free text a member may have given before the lists existed
    // (FR-086a), since a hidden field that is still saved is one nobody can correct.
    const fields: Record<string, unknown> = { khidmat_type: next };
    if (next !== "Sansta" && next !== "Both") {
      fields.sansta_id = null;
      fields.sansta_name = null;
    }
    if (next !== "Umoor" && next !== "Both") {
      fields.umoor_id = null;
      fields.umoor_name = null;
    }

    onChange("__fields__", fields);
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-textMuted">
        Any service you give to another Sansta or Umoor, outside your Hizb.
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Khidmat Type"
          value={type ?? ""}
          onChange={(e) => onTypeChange(e.target.value)}
          options={enumOptions(KHIDMAT_TYPES)}
          error={errorFor("khidmat_type")}
          disabled={disabled}
        />

        {/* FR-086a. Chosen from the lists an administrator maintains in Dropdown Lists,
            not typed. Where a member answered in free text before those lists existed, the
            old answer is shown underneath rather than discarded — it is still their
            answer, and nothing here can safely decide which list entry it meant. */}
        {showSansta ? (
          <div>
            <Select
              label="Sansta Name"
              value={value.sansta_id == null ? "" : String(value.sansta_id)}
              onChange={(e) => onChange("sansta_id", toNullableId(e.target.value))}
              options={lookupOptions(lookups.sanstas)}
              error={errorFor("sansta_id")}
              disabled={disabled || lookups.sanstas.length === 0}
            />
            {value.sansta_id == null && value.sansta_name ? (
              <div className="mt-1 text-xs text-textMuted">
                Previously entered: {value.sansta_name}. Choose it from the list to keep it.
              </div>
            ) : null}
          </div>
        ) : null}

        {showUmoor ? (
          <div>
            <Select
              label="Umoor Name"
              value={value.umoor_id == null ? "" : String(value.umoor_id)}
              onChange={(e) => onChange("umoor_id", toNullableId(e.target.value))}
              options={lookupOptions(lookups.umoors)}
              error={errorFor("umoor_id")}
              disabled={disabled || lookups.umoors.length === 0}
            />
            {value.umoor_id == null && value.umoor_name ? (
              <div className="mt-1 text-xs text-textMuted">
                Previously entered: {value.umoor_name}. Choose it from the list to keep it.
              </div>
            ) : null}
          </div>
        ) : null}

        <Input
          label="Designation"
          value={value.khidmat_designation ?? ""}
          onChange={(e) => onChange("khidmat_designation", e.target.value)}
          error={errorFor("khidmat_designation")}
          disabled={disabled}
        />

        <Select
          label="Since (AH)"
          value={value.khidmat_since_year == null ? "" : String(value.khidmat_since_year)}
          onChange={(e) => onChange("khidmat_since_year", toNullableId(e.target.value))}
          options={yearOptions(PROFILE_HIJRI_YEAR_MIN, lookups.current_hijri_year)}
          error={errorFor("khidmat_since_year")}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
