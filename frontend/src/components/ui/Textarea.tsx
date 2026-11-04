import type { TextareaHTMLAttributes } from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  helperText?: string;
};

/**
 * Multi-line text, matching `Input`'s shape so the two can sit side by side.
 *
 * One deliberate difference from `Input`: the helper text sits OUTSIDE the `<label>`, tied
 * to the field with `aria-describedby`. `Input` puts it inside, which makes it part of the
 * field's accessible name — so a screen reader announces "Residence AddressYour current
 * address" as the label. That is a pre-existing wrinkle in `Input`, not one worth copying
 * into a new component.
 */
export function Textarea({
  label,
  error,
  helperText,
  className = "",
  id,
  rows = 3,
  ...props
}: TextareaProps) {
  const fieldId = id ?? (label ? `textarea-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  const describedBy = error || helperText ? `${fieldId}-description` : undefined;

  return (
    <div className="block text-left">
      {label ? (
        <label htmlFor={fieldId} className="mb-1 block text-sm font-semibold">
          {label}
        </label>
      ) : null}
      <textarea
        {...props}
        id={fieldId}
        rows={rows}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={[
          "w-full rounded-input border border-border bg-white px-3 py-2 text-sm",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          error ? "border-danger" : "",
          className
        ].join(" ")}
      />
      {error ? (
        <div id={describedBy} className="mt-1 text-xs text-danger">
          {error}
        </div>
      ) : helperText ? (
        <div id={describedBy} className="mt-1 text-xs text-textMuted">
          {helperText}
        </div>
      ) : null}
    </div>
  );
}
