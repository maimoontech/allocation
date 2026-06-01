import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  helperText?: string;
};

export function Input({ label, error, helperText, className = "", ...props }: InputProps) {
  return (
    <label className="block text-left">
      {label ? <div className="mb-1 text-sm font-semibold">{label}</div> : null}
      <input
        {...props}
        className={[
          "w-full rounded-input border border-border bg-white px-3 py-2 text-sm",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          error ? "border-danger" : "",
          className
        ].join(" ")}
      />
      {error ? (
        <div className="mt-1 text-xs text-danger">{error}</div>
      ) : helperText ? (
        <div className="mt-1 text-xs text-textMuted">{helperText}</div>
      ) : null}
    </label>
  );
}

