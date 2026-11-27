import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { YesNoField } from "../../../components/ui/YesNoField";
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
 *
 * FR-086b adds the Muntasib Ila Jamea question and the Farig Year it asks for on Yes. That
 * year is a plain text box, not a year dropdown like `Since (AH)` above it, and it is not
 * validated: the member's answer is stored exactly as typed, so "1441", "1441 AH" and
 * "2019-20" all survive. Nothing counts or sorts on the value, which is what makes leaving the
 * calendar to the member safe rather than sloppy.
 */
export function Tab12Khidmat({ value, lookups, errorFor, onChange, disabled }: TabProps) {
  const type = value.khidmat_type;
  const showSansta = type === "Sansta" || type === "Both";
  const showUmoor = type === "Umoor" || type === "Both";

  const isMuntasib = value.is_muntasib_ila_jamea === true;

  function onMuntasibChange(next: boolean) {
    if (!next) {
      // Hide and clear together, the same rule the Khidmat type follows above and FR-059
      // follows on Tab 5. A disabled or unmounted box fires no change event, so a year
      // entered before the answer changed would otherwise stay saved out of sight.
      onChange("__fields__", { is_muntasib_ila_jamea: false, farig_year: null });
      return;
    }
    onChange("is_muntasib_ila_jamea", true);
  }

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

      {/* FR-086b. Its own section rather than another cell in the grid above: this question
          is about Aljamea-tus-Saifiyah, not about the Sansta or Umoor Khidmat the rest of the
          tab records, and running the two together would read as one. */}
      <div className="border-t border-border pt-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <YesNoField
            label="Are you a Muntasib Ila Jamea?"
            name="is_muntasib_ila_jamea"
            value={value.is_muntasib_ila_jamea}
            onChange={onMuntasibChange}
            error={errorFor("is_muntasib_ila_jamea")}
            disabled={disabled}
          />

          {/* Shown only on Yes. Not required on Yes, though: the profile has no mandatory
              fields (FR-095), so an unanswered Farig Year shows up in the member's completion
              figure rather than blocking the save. */}
          {isMuntasib ? (
            <Input
              label="Farig Year"
              value={value.farig_year ?? ""}
              onChange={(e) => onChange("farig_year", e.target.value)}
              helperText="The year you became Farig, as you would write it."
              error={errorFor("farig_year")}
              disabled={disabled}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
