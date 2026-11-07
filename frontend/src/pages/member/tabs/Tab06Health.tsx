import { useState } from "react";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { DatePicker } from "../../../components/ui/DatePicker";
import { YesNoField } from "../../../components/ui/YesNoField";
import { todayIso } from "../../../utils/dates";
import { BmiMeter } from "./BmiMeter";
import {
  cmToFeetInches,
  computeBmi,
  enumOptions,
  feetInchesToCm,
  toNullableNumber
} from "./shared";
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

  /**
   * FR-063b. Height is ASKED in feet and inches and STORED in centimetres.
   *
   * The two boxes need their own state, because a half-typed height is not yet a height:
   * deriving them from `height_cm` alone would renumber the inches box the moment the feet
   * box changed, and clearing feet would wipe inches. So the typed text is kept here and
   * only turned into centimetres on the way out.
   *
   * The entry is remembered WITH the centimetre value it produced. When `height_cm` changes
   * from anywhere else — the profile loading, Discard, an administrator's copy of this form
   * — it no longer matches and the stored value takes over, which is what keeps the boxes
   * honest without a second effect to synchronise them.
   */
  const [entry, setEntry] = useState<{ cm: number | null; feet: string; inches: string } | null>(
    null
  );

  const derived = cmToFeetInches(value.height_cm);
  const height =
    entry && entry.cm === value.height_cm
      ? entry
      : {
          cm: value.height_cm,
          feet: derived.feet == null ? "" : String(derived.feet),
          inches: derived.inches == null ? "" : String(derived.inches)
        };

  function onHeightPart(part: "feet" | "inches", raw: string) {
    const next = { ...height, [part]: raw };
    const cm = feetInchesToCm(toNullableNumber(next.feet), toNullableNumber(next.inches));
    setEntry({ cm, feet: next.feet, inches: next.inches });
    onChange("height_cm", cm);
  }

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

      {/* The meter sits beside the Regular Donor question, top-aligned with it. That cell
          spans the left column's rows, and the last row is the flexible one, so the meter's
          height lands there rather than opening a gap between Blood Group and Last
          Donation Date. */}
      <div className="grid gap-3 sm:grid-cols-2 sm:grid-rows-[auto_auto_1fr]">
        <div className="sm:col-start-1 sm:row-start-1">
          <Select
            label="Blood Group"
            value={value.blood_group ?? ""}
            onChange={(e) => onChange("blood_group", e.target.value === "" ? null : e.target.value)}
            options={enumOptions(BLOOD_GROUPS)}
            error={errorFor("blood_group")}
            disabled={disabled}
          />
        </div>

        <div className="flex items-start gap-6 sm:col-start-2 sm:row-span-3 sm:row-start-1">
          <YesNoField
            label="Regular Donor"
            name="is_regular_donor"
            value={value.is_regular_donor}
            onChange={onDonorChange}
            error={errorFor("is_regular_donor")}
            disabled={disabled}
          />
          <div className="shrink-0">
            <BmiMeter bmi={liveBmi} />
          </div>
        </div>

        {isDonor ? (
          <div className="sm:col-start-1 sm:row-start-2">
            <DatePicker
              label="Last Donation Date"
              value={value.last_donation_date}
              onChange={(next) => onChange("last_donation_date", next)}
              error={errorFor("last_donation_date")}
              max={todayIso()}
              disabled={disabled}
            />
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {/*
          FR-063b. Two boxes, and the centimetres shown beneath them.
          Asking for a single number in centimetres is what let a member enter 1.75 — their
          height in metres — which stored happily and overflowed the generated BMI months
          later. Feet and inches have no unit to confuse: 5 and 9 cannot be mistaken for
          anything else, and the readout shows exactly what will be saved.
        */}
        <div>
          <div className="mb-1 text-sm font-semibold">Height</div>
          <div className="flex gap-2">
            <Input
              aria-label="Height in feet"
              type="number"
              inputMode="numeric"
              min={1}
              max={9}
              step={1}
              placeholder="ft"
              value={height.feet}
              onChange={(e) => onHeightPart("feet", e.target.value)}
              disabled={disabled}
            />
            <Input
              aria-label="Height in inches"
              type="number"
              inputMode="decimal"
              min={0}
              max={11.9}
              step={0.5}
              placeholder="in"
              value={height.inches}
              onChange={(e) => onHeightPart("inches", e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="mt-1 text-xs text-textMuted">
            {value.height_cm == null
              ? "Feet and inches, e.g. 5 ft 9 in."
              : `Saved as ${value.height_cm} cm.`}
          </div>
          {errorFor("height_cm") ? (
            <div className="mt-1 text-xs text-danger">{errorFor("height_cm")}</div>
          ) : null}
        </div>

        <Input
          label="Weight (kg)"
          type="number"
          inputMode="decimal"
          min={2}
          max={500}
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
