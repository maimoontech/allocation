import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { DatePicker } from "../../../components/ui/DatePicker";
import { YesNoField } from "../../../components/ui/YesNoField";
import { todayIso } from "../../../utils/dates";
import { computeBmi, enumOptions, toNullableNumber } from "./shared";
import type { TabProps } from "./shared";

/** FR-061. A fixed medical standard, so these are hard-coded rather than a lookup. */
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

/**
 * Tab 6 — Health and Fitness.
 *
 * This tab holds the most sensitive data in the profile, so it says plainly who can see it.
 * The values are returned only to the member and to authorised administrators, and they are
 * excluded from every export and from error payloads (FR-065, FR-066, FR-101) — enforced on
 * the server, not here.
 *
 * BMI is read-only and derived (FR-064). The database generates the stored value, so it can
 * never be written or drift from its inputs; the figure shown while typing is computed
 * locally with the same formula purely so the field is not blank until a save.
 */
export function Tab06Health({ value, errorFor, onChange, disabled }: TabProps) {
  const isDonor = value.is_regular_donor === true;

  // Live figure, for display between keystroke and save. The stored one is authoritative.
  const liveBmi = computeBmi(value.height_cm, value.weight_kg);

  function onDonorChange(next: boolean) {
    if (!next) {
      // A donation date makes no sense alongside "not a regular donor"; clear it together.
      onChange("__fields__", { is_regular_donor: false, last_donation_date: null });
      return;
    }
    onChange("is_regular_donor", true);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-input border border-border bg-surface p-2 text-xs text-textMuted">
        These details are visible only to you and to authorised administrators. They are never
        included in reports or exports.
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Blood Group"
          value={value.blood_group ?? ""}
          onChange={(e) => onChange("blood_group", e.target.value === "" ? null : e.target.value)}
          options={enumOptions(BLOOD_GROUPS)}
          error={errorFor("blood_group")}
          disabled={disabled}
        />

        <YesNoField
          label="Regular Donor"
          name="is_regular_donor"
          value={value.is_regular_donor}
          onChange={onDonorChange}
          error={errorFor("is_regular_donor")}
          disabled={disabled}
        />

        {isDonor ? (
          <DatePicker
            label="Last Donation Date"
            value={value.last_donation_date}
            onChange={(next) => onChange("last_donation_date", next)}
            error={errorFor("last_donation_date")}
            max={todayIso()}
            disabled={disabled}
          />
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {/* FR-063: the unit is part of the label, so there is no ambiguity about what to type. */}
        <Input
          label="Height (cm)"
          type="number"
          inputMode="decimal"
          min={1}
          step={0.1}
          value={value.height_cm == null ? "" : String(value.height_cm)}
          onChange={(e) => onChange("height_cm", toNullableNumber(e.target.value))}
          error={errorFor("height_cm")}
          disabled={disabled}
        />

        <Input
          label="Weight (kg)"
          type="number"
          inputMode="decimal"
          min={1}
          step={0.1}
          value={value.weight_kg == null ? "" : String(value.weight_kg)}
          onChange={(e) => onChange("weight_kg", toNullableNumber(e.target.value))}
          error={errorFor("weight_kg")}
          disabled={disabled}
        />

        {/* FR-064: read-only, and blank until both measurements are present. */}
        <Input
          label="BMI"
          value={liveBmi == null ? "" : String(liveBmi)}
          readOnly
          disabled
          placeholder="From height and weight"
          helperText="Calculated automatically."
        />
      </div>
    </div>
  );
}
