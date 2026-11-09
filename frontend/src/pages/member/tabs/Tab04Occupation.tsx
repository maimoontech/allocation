import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Textarea } from "../../../components/ui/Textarea";
import { RadioGroup } from "../../../components/ui/RadioGroup";
import { MultiSelect } from "../../../components/ui/MultiSelect";
import { byName, toNullableId, yearOptions } from "./shared";
import type { TabProps } from "./shared";

const THIS_YEAR = new Date().getFullYear();

/**
 * Tab 4 — Occupation.
 *
 * Two conditional behaviours (FR-051, FR-052):
 *
 *   - The company field's LABEL follows the occupation type. One column stores it either
 *     way; only the wording changes, because "Company Name" for a shopkeeper reads wrongly.
 *   - Designation applies to a Job only. Choosing Business both hides it and CLEARS it, in
 *     the same update, so a value cannot linger invisibly and reappear if the member
 *     switches back. The server clears it too (FR-028) — this just keeps the screen honest.
 */
export function Tab04Occupation({ value, lookups, errorFor, onChange, disabled }: TabProps) {
  const isJob = value.occupation_type === "Job";
  const isBusiness = value.occupation_type === "Business";

  function onTypeChange(next: string) {
    if (next === "Business") {
      // Hide and clear together, in one update.
      onChange("__fields__", { occupation_type: next, designation: null });
      return;
    }
    onChange("occupation_type", next);
  }

  return (
    <div className="space-y-4">
      <RadioGroup
        label="Occupation Type"
        options={[
          { value: "Job", label: "Job" },
          { value: "Business", label: "Business" }
        ]}
        value={value.occupation_type}
        onChange={onTypeChange}
        error={errorFor("occupation_type")}
        disabled={disabled}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label={isBusiness ? "Business Name" : "Company Name"}
          value={value.organisation_name ?? ""}
          onChange={(e) => onChange("organisation_name", e.target.value)}
          error={errorFor("organisation_name")}
          helperText={
            value.occupation_type === null
              ? "Choose Job or Business above to label this correctly."
              : undefined
          }
          disabled={disabled}
        />

        {/* FR-052: present only for a Job. */}
        {isJob ? (
          <Input
            label="Designation"
            value={value.designation ?? ""}
            onChange={(e) => onChange("designation", e.target.value)}
            error={errorFor("designation")}
            disabled={disabled}
          />
        ) : null}

        <Select
          label="Since Year"
          value={value.occupation_since_year == null ? "" : String(value.occupation_since_year)}
          onChange={(e) => onChange("occupation_since_year", toNullableId(e.target.value))}
          options={yearOptions(1950, THIS_YEAR)}
          error={errorFor("occupation_since_year")}
          disabled={disabled}
        />

        <Input
          label="Phone No."
          type="tel"
          inputMode="tel"
          value={value.work_phone_no ?? ""}
          onChange={(e) => onChange("work_phone_no", e.target.value)}
          error={errorFor("work_phone_no")}
          disabled={disabled}
        />
      </div>

      <Textarea
        label="Address"
        value={value.work_address ?? ""}
        onChange={(e) => onChange("work_address", e.target.value)}
        error={errorFor("work_address")}
        rows={3}
        disabled={disabled}
      />

      <MultiSelect
        label="Skills"
        // FR-093a. A-Z, like every other list of names. 45 skills unsorted is a list you
        // read rather than scan, and the search box helps only once you know the word.
        options={[...lookups.skills].sort(byName)}
        value={value.skill_ids ?? []}
        onChange={(ids) => onChange("skill_ids", ids)}
        error={errorFor("skill_ids")}
        helperText="Select any that apply."
        searchPlaceholder="Search skills..."
        disabled={disabled}
      />
    </div>
  );
}
