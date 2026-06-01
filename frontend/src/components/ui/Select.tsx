import type { SelectHTMLAttributes } from "react";

export type SelectOption = { value: string; label: string };

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  options: SelectOption[];
  error?: string;
};

export function Select({ label, options, error, className = "", ...props }: SelectProps) {
  return (
    <label className="block text-left">
      {label ? <div className="mb-1 text-sm font-semibold">{label}</div> : null}
      <select
        {...props}
        className={[
          "w-full rounded-input border border-border bg-white px-3 py-2 text-sm",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          error ? "border-danger" : "",
          className
        ].join(" ")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <div className="mt-1 text-xs text-danger">{error}</div> : null}
    </label>
  );
}

