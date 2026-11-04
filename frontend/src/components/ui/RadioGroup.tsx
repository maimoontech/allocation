import { useId } from "react";

export type RadioOption = { value: string; label: string };

export type RadioGroupProps = {
  label?: string;
  name?: string;
  options: RadioOption[];
  value: string | null;
  onChange: (value: string) => void;
  error?: string;
  helperText?: string;
  disabled?: boolean;
};

/**
 * A set of mutually exclusive choices.
 *
 * A real `<fieldset>`/`<legend>` with native radio inputs rather than styled buttons, so
 * arrow-key navigation, grouping and the announced label all come from the browser instead
 * of being reimplemented.
 *
 * `useId` keeps the generated ids unique when the same group appears more than once — which
 * it does: Tab 9 renders one "Attended With" group per attendance record.
 */
export function RadioGroup({
  label,
  name,
  options,
  value,
  onChange,
  error,
  helperText,
  disabled
}: RadioGroupProps) {
  const autoId = useId();
  const groupName = name ?? autoId;
  const describedBy = error || helperText ? `${groupName}-description` : undefined;

  return (
    <fieldset
      className="block text-left"
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
    >
      {label ? <legend className="mb-1 text-sm font-semibold">{label}</legend> : null}

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {options.map((option) => {
          const optionId = `${groupName}-${option.value.replace(/\s+/g, "-")}`;
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className="inline-flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                type="radio"
                id={optionId}
                name={groupName}
                value={option.value}
                checked={value === option.value}
                disabled={disabled}
                onChange={() => onChange(option.value)}
                className="h-4 w-4 accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>

      {error ? (
        <div id={describedBy} className="mt-1 text-xs text-danger">
          {error}
        </div>
      ) : helperText ? (
        <div id={describedBy} className="mt-1 text-xs text-textMuted">
          {helperText}
        </div>
      ) : null}
    </fieldset>
  );
}
