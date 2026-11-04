import { Input } from "./Input";

export type DatePickerProps = {
  label?: string;
  /** Always `YYYY-MM-DD`, or null. */
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string;
  helperText?: string;
  /** Inclusive bounds, also `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  disabled?: boolean;
};

/**
 * A date field.
 *
 * Wraps the native `<input type="date">`, which already gives a platform-appropriate picker,
 * keyboard entry and locale-correct display — all of which a hand-built calendar would have
 * to re-earn, and would get wrong on a phone.
 *
 * It emits `YYYY-MM-DD` or null, which is exactly what the API expects and what
 * `calculateHijriParts` requires, so no format conversion happens anywhere between the input
 * and the database.
 *
 * `min` and `max` are a convenience, not a guarantee: the server re-checks every date
 * (FR-028), because an HTML attribute is trivially bypassed.
 */
export function DatePicker({
  label,
  value,
  onChange,
  error,
  helperText,
  min,
  max,
  disabled
}: DatePickerProps) {
  return (
    <Input
      type="date"
      label={label}
      // An empty input means "not set", which is null rather than an empty string, so the
      // API clears the column instead of rejecting "".
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      error={error}
      helperText={helperText}
      min={min}
      max={max}
      disabled={disabled}
    />
  );
}
