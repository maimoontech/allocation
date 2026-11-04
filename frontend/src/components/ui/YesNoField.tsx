import { RadioGroup } from "./RadioGroup";

export type YesNoFieldProps = {
  label?: string;
  name?: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  error?: string;
  helperText?: string;
  disabled?: boolean;
};

/**
 * A Yes/No question.
 *
 * Seven of these appear across Tabs 5, 6 and 11. Built on `RadioGroup` rather than a
 * checkbox because the three states are distinct and matter: the server stores these as
 * nullable booleans, and "not answered yet" is not the same as "No". A checkbox can only
 * express two of the three, and would silently turn every unanswered question into a No —
 * which for "do you attend the Karachi Tamreen session?" would then demand a reason the
 * member never meant to give (FR-081).
 */
export function YesNoField({
  label,
  name,
  value,
  onChange,
  error,
  helperText,
  disabled
}: YesNoFieldProps) {
  return (
    <RadioGroup
      label={label}
      name={name}
      options={[
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" }
      ]}
      value={value === null || value === undefined ? null : value ? "yes" : "no"}
      onChange={(next) => onChange(next === "yes")}
      error={error}
      helperText={helperText}
      disabled={disabled}
    />
  );
}
