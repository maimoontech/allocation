import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Textarea } from "../../../components/ui/Textarea";
import { RadioGroup, type RadioOption } from "../../../components/ui/RadioGroup";
import { MultiSelect } from "../../../components/ui/MultiSelect";
import { byName, toNullableId, yearOptions } from "./shared";
import type { TabProps } from "./shared";

const THIS_YEAR = new Date().getFullYear();

/** FR-050a. 'Student' joined Job and Business on 2026-11-21. */
const OCCUPATION_TYPES: RadioOption[] = [
  { value: "Job", label: "Job" },
  { value: "Business", label: "Business" },
  { value: "Student", label: "Student" }
];

/**
 * Tab 4 — Occupation.
 *
 * Three conditional behaviours (FR-050a, FR-051, FR-052):
 *
 *   - The company field's LABEL follows the occupation type. One column stores it either
 *     way; only the wording changes, because "Company Name" for a shopkeeper reads wrongly.
 *   - Designation applies to a Job only. Choosing Business both hides it and CLEARS it, in
 *     the same update, so a value cannot linger invisibly and reappear if the member
 *     switches back. The server clears it too (FR-028) — this just keeps the screen honest.
 *   - A STUDENT is asked for Skills and nothing else. The employment fields stay on screen
 *     but go disabled, each saying why.
 *
 * WHY STUDENT DISABLES RATHER THAN HIDES
 *   The Solo rule on Tab 3 settled this one. Removing four fields and a text area empties
 *   most of the tab, and a member who has just chosen Student has no way to tell whether the
 *   form is narrowing itself deliberately or has broken. Left in place and greyed, with a
 *   line of explanation, the tab says what it is doing. Skills — the one field that still
 *   applies — is then visibly the thing to fill in.
 *
 * WHY IT ALSO CLEARS THEM
 *   A disabled control fires no change event, so the browser can never clear these on the
 *   member's behalf once they are greyed. Without clearing them in the SAME update that sets
 *   the type, a member who worked and then went back to study would keep a stored employer
 *   and work address behind fields they can no longer reach. The server applies the same
 *   rule, so a stale form or an older build cannot store them either.
 */
export function Tab04Occupation({ value, lookups, errorFor, onChange, disabled }: TabProps) {
  const isJob = value.occupation_type === "Job";
  const isBusiness = value.occupation_type === "Business";
  const isStudent = value.occupation_type === "Student";

  // Disabled by the page as a whole (an administrator reading someone else's profile), or by
  // the member's own answer.
  const employmentDisabled = disabled || isStudent;

  const STUDENT_NOTE = "Not applicable to a Student.";

  function onTypeChange(next: string) {
    if (next === "Student") {
      // Everything an employer answers, cleared in the one update that disables it.
      onChange("__fields__", {
        occupation_type: next,
        organisation_name: null,
        designation: null,
        occupation_since_year: null,
        work_address: null,
        work_phone_no: null
      });
      return;
    }
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
        options={OCCUPATION_TYPES}
        value={value.occupation_type}
        onChange={onTypeChange}
        error={errorFor("occupation_type")}
        disabled={disabled}
      />

      {isStudent ? (
        <div className="rounded-input border border-border bg-surface p-3 text-sm text-textMuted">
          <div className="font-semibold text-textPrimary">You have chosen Student.</div>
          {/* One sentence, one text node, no inline markup — so what the member reads and
              what a test can assert are the same string. */}
          <div className="mt-1">
            Only Skills below is asked on this tab. The employment fields are switched off,
            and anything previously entered in them has been cleared.
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Input
            label={isBusiness ? "Business Name" : "Company Name"}
            value={value.organisation_name ?? ""}
            onChange={(e) => onChange("organisation_name", e.target.value)}
            error={errorFor("organisation_name")}
            helperText={
              value.occupation_type === null
                ? "Choose Job, Business or Student above to label this correctly."
                : undefined
            }
            disabled={employmentDisabled}
          />
          {/* The note sits under the control rather than in it: a disabled field with no
              reason given reads as a fault. Same reasoning as the Solo fields on Tab 3. */}
          {isStudent ? <div className="mt-1 text-xs text-textMuted">{STUDENT_NOTE}</div> : null}
        </div>

        {/* FR-052: present only for a Job — so never for a Student. */}
        {isJob ? (
          <Input
            label="Designation"
            value={value.designation ?? ""}
            onChange={(e) => onChange("designation", e.target.value)}
            error={errorFor("designation")}
            disabled={disabled}
          />
        ) : null}

        <div>
          <Select
            label="Since Year"
            value={value.occupation_since_year == null ? "" : String(value.occupation_since_year)}
            onChange={(e) => onChange("occupation_since_year", toNullableId(e.target.value))}
            options={yearOptions(1950, THIS_YEAR)}
            error={errorFor("occupation_since_year")}
            disabled={employmentDisabled}
          />
          {isStudent ? <div className="mt-1 text-xs text-textMuted">{STUDENT_NOTE}</div> : null}
        </div>

        <div>
          <Input
            label="Phone No."
            type="tel"
            inputMode="tel"
            value={value.work_phone_no ?? ""}
            onChange={(e) => onChange("work_phone_no", e.target.value)}
            error={errorFor("work_phone_no")}
            disabled={employmentDisabled}
          />
          {isStudent ? <div className="mt-1 text-xs text-textMuted">{STUDENT_NOTE}</div> : null}
        </div>
      </div>

      <div>
        <Textarea
          label="Address"
          value={value.work_address ?? ""}
          onChange={(e) => onChange("work_address", e.target.value)}
          error={errorFor("work_address")}
          rows={3}
          disabled={employmentDisabled}
        />
        {isStudent ? <div className="mt-1 text-xs text-textMuted">{STUDENT_NOTE}</div> : null}
      </div>

      {/* The one field a Student IS asked. Never disabled by the occupation type. */}
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
