import { Select } from "../../../components/ui/Select";
import { Textarea } from "../../../components/ui/Textarea";
import { YesNoField } from "../../../components/ui/YesNoField";
import { lookupOptions, toNullableId } from "./shared";
import type { TabProps } from "./shared";

/**
 * Tab 11 — Tamreen.
 *
 * FR-081 is the rule to get right: a reason is required when the member does NOT attend the
 * Karachi Zakireen Tamreen session. The reason field appears only on No, and answering Yes
 * clears it — so a reason cannot sit invisibly beside an answer that contradicts it.
 *
 * Note that *unanswered* must not demand a reason: only an explicit No does. That is exactly
 * why `YesNoField` is radios rather than a checkbox, which would collapse "not yet answered"
 * into No and immediately ask the member to justify something they never said.
 *
 * The two frequency questions draw on one shared list (spec assumption 6), and the method
 * list is spec assumption 7 — both still awaiting sign-off, so their values show as drafts.
 */
export function Tab11Tamreen({ value, lookups, errorFor, onChange, disabled }: TabProps) {
  const doesNotAttend = value.attends_karachi_tamreen === false;

  function onAttendsChange(next: boolean) {
    if (next) {
      // Hide and clear together (FR-081).
      onChange("__fields__", { attends_karachi_tamreen: true, tamreen_absence_reason: null });
      return;
    }
    onChange("attends_karachi_tamreen", false);
  }

  return (
    <div className="space-y-4">
      <YesNoField
        label="Attend Karachi Zakireen Tamreen Session"
        name="attends_karachi_tamreen"
        value={value.attends_karachi_tamreen}
        onChange={onAttendsChange}
        error={errorFor("attends_karachi_tamreen")}
        disabled={disabled}
      />

      {/* FR-081: required, and only present, when the answer is No. */}
      {doesNotAttend ? (
        <Textarea
          label="Reason"
          value={value.tamreen_absence_reason ?? ""}
          onChange={(e) => onChange("tamreen_absence_reason", e.target.value)}
          error={errorFor("tamreen_absence_reason")}
          helperText="Required, since you do not attend the session."
          rows={2}
          disabled={disabled}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Party Tamreen Frequency"
          value={
            value.party_tamreen_frequency_id == null
              ? ""
              : String(value.party_tamreen_frequency_id)
          }
          onChange={(e) => onChange("party_tamreen_frequency_id", toNullableId(e.target.value))}
          options={lookupOptions(lookups.tamreen_frequencies)}
          error={errorFor("party_tamreen_frequency_id")}
          disabled={disabled || lookups.tamreen_frequencies.length === 0}
        />

        <Select
          label="Solo Tamreen Frequency"
          value={
            value.solo_tamreen_frequency_id == null
              ? ""
              : String(value.solo_tamreen_frequency_id)
          }
          onChange={(e) => onChange("solo_tamreen_frequency_id", toNullableId(e.target.value))}
          options={lookupOptions(lookups.tamreen_frequencies)}
          error={errorFor("solo_tamreen_frequency_id")}
          disabled={disabled || lookups.tamreen_frequencies.length === 0}
        />

        <Select
          label="Method Used for Tamreen"
          value={value.tamreen_method_id == null ? "" : String(value.tamreen_method_id)}
          onChange={(e) => onChange("tamreen_method_id", toNullableId(e.target.value))}
          options={lookupOptions(lookups.tamreen_methods)}
          error={errorFor("tamreen_method_id")}
          disabled={disabled || lookups.tamreen_methods.length === 0}
        />
      </div>

      <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
        <YesNoField
          label="Take Assistance from Any Ustad or Senior Zakireen"
          name="takes_ustad_assistance"
          value={value.takes_ustad_assistance}
          onChange={(next) => onChange("takes_ustad_assistance", next)}
          error={errorFor("takes_ustad_assistance")}
          disabled={disabled}
        />

        <YesNoField
          label="Idaratuz Zakereen Books"
          name="uses_idaratuz_zakereen_books"
          value={value.uses_idaratuz_zakereen_books}
          onChange={(next) => onChange("uses_idaratuz_zakereen_books", next)}
          error={errorFor("uses_idaratuz_zakereen_books")}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
