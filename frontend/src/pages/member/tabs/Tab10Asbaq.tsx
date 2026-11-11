// import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { EMPTY_LOOKUP_NOTE, enumOptions, lookupOptions, toNullableId } from "./shared";
import type { TabProps } from "./shared";

/** FR-078. A closed set named in the requirement. */
const ASBAQ_LEVELS = ["Zaher", "Taweel", "Haqiqat"] as const;

/**
 * Tab 10 — Asbaq.
 *
 * No conditional rules. Ustad is free text because no Ustad lookup exists in the system, and
 * inventing one would mean inventing names (FR-079).
 */
export function Tab10Asbaq({ value, lookups, errorFor, onChange, disabled }: TabProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Asbaq Level"
          value={value.asbaq_level ?? ""}
          onChange={(e) => onChange("asbaq_level", e.target.value === "" ? null : e.target.value)}
          options={enumOptions(ASBAQ_LEVELS)}
          error={errorFor("asbaq_level")}
          disabled={disabled}
        />

        <Select
          label="Halqa"
          value={value.halqa_id == null ? "" : String(value.halqa_id)}
          onChange={(e) => onChange("halqa_id", toNullableId(e.target.value))}
          options={lookupOptions(lookups.halqas, "Select...", "display")}
          error={errorFor("halqa_id")}
          disabled={disabled || lookups.halqas.length === 0}
        />

        {/* <Input
          label="Ustad"
          value={value.asbaq_ustad ?? ""}
          onChange={(e) => onChange("asbaq_ustad", e.target.value)}
          error={errorFor("asbaq_ustad")}
          disabled={disabled}
        /> */}
      </div>

      {/* FR-095: an empty list explains itself and does not block the rest of the profile. */}
      {lookups.halqas.length === 0 ? (
        <div className="rounded-input border border-warning bg-warning/5 p-2 text-xs text-warning">
          Halqa options have not been set up yet. {EMPTY_LOOKUP_NOTE}
        </div>
      ) : null}
    </div>
  );
}
