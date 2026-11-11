import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { DatePicker } from "../../../components/ui/DatePicker";
import { YesNoField } from "../../../components/ui/YesNoField";
import { todayIso } from "../../../utils/dates";
import { enumOptions, lookupOptions, toNullableId } from "./shared";
import type { TabProps } from "./shared";

const EDUCATION_LEVELS = [
  "Primary",
  "Middle",
  "Secondary",
  "Intermediate",
  "Bachelors",
  "Masters",
  "PhD"
] as const;

const EDUCATION_STATUS = ["Complete", "Ongoing"] as const;

/**
 * Tab 5 — Education and Hifz.
 *
 * The conditional rule here is FR-059: a Sanad must be chosen when the member says they hold
 * one, and answering No clears whatever was selected. The Sanad select appears only on Yes,
 * so the field cannot be filled in and then contradicted by the answer above it.
 *
 * Unanswered is distinct from No, which is why `YesNoField` is radios — see its own notes.
 */
export function Tab05EducationHifz({ value, lookups, errorFor, onChange, disabled }: TabProps) {
  const hasSanad = value.has_hifz_sanad === true;

  function onHasSanadChange(next: boolean) {
    if (!next) {
      // Hide and clear together (FR-059).
      onChange("__fields__", { has_hifz_sanad: false, sanad_id: null });
      return;
    }
    onChange("has_hifz_sanad", true);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Standard / Degree"
          value={value.education_level ?? ""}
          onChange={(e) =>
            onChange("education_level", e.target.value === "" ? null : e.target.value)
          }
          options={enumOptions(EDUCATION_LEVELS)}
          error={errorFor("education_level")}
          disabled={disabled}
        />

        <Input
          label="Major Subjects"
          value={value.major_subjects ?? ""}
          onChange={(e) => onChange("major_subjects", e.target.value)}
          error={errorFor("major_subjects")}
          disabled={disabled}
        />

        <Select
          label="Status"
          value={value.education_status ?? ""}
          onChange={(e) =>
            onChange("education_status", e.target.value === "" ? null : e.target.value)
          }
          options={enumOptions(EDUCATION_STATUS)}
          error={errorFor("education_status")}
          disabled={disabled}
        />
      </div>

      <div className="border-t border-border pt-4">
        <div className="mb-3 text-sm font-semibold">Hifz</div>

        <div className="grid gap-3 sm:grid-cols-2">
          <YesNoField
            label="Hifz Sanad"
            name="has_hifz_sanad"
            value={value.has_hifz_sanad}
            onChange={onHasSanadChange}
            error={errorFor("has_hifz_sanad")}
            disabled={disabled}
          />

          {/* FR-059: shown, and required, only when the answer above is Yes. */}
          {hasSanad ? (
            <Select
              label="Sanad"
              value={value.sanad_id == null ? "" : String(value.sanad_id)}
              onChange={(e) => onChange("sanad_id", toNullableId(e.target.value))}
              options={lookupOptions(lookups.sanads, "Select...", "display")}
              error={errorFor("sanad_id")}
              disabled={disabled}
            />
          ) : null}
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <div className="mb-1 text-sm font-semibold">Hifz Current Status</div>
        <div className="mb-3 text-xs text-textMuted">Where you have reached so far.</div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Surah"
            value={value.hifz_current_surah ?? ""}
            onChange={(e) => onChange("hifz_current_surah", e.target.value)}
            error={errorFor("hifz_current_surah")}
            disabled={disabled}
          />
          <Input
            label="Ayyah"
            value={value.hifz_current_ayyah ?? ""}
            onChange={(e) => onChange("hifz_current_ayyah", e.target.value)}
            error={errorFor("hifz_current_ayyah")}
            // Text, not a number: a member may legitimately record a range.
            helperText="A single ayyah or a range."
            disabled={disabled}
          />
          <DatePicker
            label="Last Update"
            value={value.hifz_last_update}
            onChange={(next) => onChange("hifz_last_update", next)}
            error={errorFor("hifz_last_update")}
            max={todayIso()}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
