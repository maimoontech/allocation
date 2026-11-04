import { useId, useMemo, useState } from "react";

export type MultiSelectOption = { id: number; name: string; is_draft?: boolean };

export type MultiSelectProps = {
  label?: string;
  options: MultiSelectOption[];
  value: number[];
  onChange: (value: number[]) => void;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  /** Shown when the list is empty, which FR-095 requires to be explained rather than blank. */
  emptyMessage?: string;
  searchPlaceholder?: string;
};

/**
 * Multiple selection from a long list — the Tab 4 skills field, which has 45 options.
 *
 * A searchable checkbox list in a scroll box, not a popover or a native `<select multiple>`:
 *
 *   - `<select multiple>` requires ctrl-clicking to select more than one, which most people
 *     do not know, and is close to unusable on a touch screen.
 *   - A popover would need focus trapping, outside-click handling and viewport flipping to
 *     behave, none of which this form needs.
 *
 * Native checkboxes bring their own keyboard and screen-reader behaviour, and the search box
 * filters rather than hides selections, so a filtered view can never silently drop one.
 */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  error,
  helperText,
  disabled,
  emptyMessage,
  searchPlaceholder = "Search..."
}: MultiSelectProps) {
  const groupId = useId();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.name.toLowerCase().includes(needle));
  }, [options, search]);

  const selected = useMemo(() => new Set(value), [value]);

  // Shown above the list so a selection hidden by the current filter is still visible, and
  // can still be removed.
  const selectedOptions = useMemo(
    () => options.filter((option) => selected.has(option.id)),
    [options, selected]
  );

  function toggle(id: number) {
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  if (options.length === 0) {
    return (
      <div className="block text-left">
        {label ? <div className="mb-1 text-sm font-semibold">{label}</div> : null}
        <div className="rounded-input border border-warning bg-warning/5 p-2 text-xs text-warning">
          {emptyMessage ??
            "No options have been set up yet. You can still complete and save the rest of your profile."}
        </div>
      </div>
    );
  }

  return (
    <fieldset className="block text-left" aria-describedby={error ? `${groupId}-error` : undefined}>
      {label ? (
        <legend className="mb-1 text-sm font-semibold">
          {label}
          {value.length > 0 ? (
            <span className="ml-2 font-normal text-textMuted">({value.length} selected)</span>
          ) : null}
        </legend>
      ) : null}

      {selectedOptions.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {selectedOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(option.id)}
              aria-label={`Remove ${option.name}`}
              className="inline-flex items-center gap-1 rounded-button bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              {option.name}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : null}

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={searchPlaceholder}
        disabled={disabled}
        aria-label={label ? `Search ${label}` : "Search options"}
        className="mb-1 w-full rounded-input border border-border bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      />

      <div className="max-h-48 overflow-y-auto rounded-input border border-border bg-white p-2">
        {filtered.length === 0 ? (
          <div className="px-1 py-2 text-xs text-textMuted">No matches for “{search}”.</div>
        ) : (
          <div className="space-y-1">
            {filtered.map((option) => {
              const optionId = `${groupId}-${option.id}`;
              return (
                <label
                  key={option.id}
                  htmlFor={optionId}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-black/5"
                >
                  <input
                    type="checkbox"
                    id={optionId}
                    checked={selected.has(option.id)}
                    disabled={disabled}
                    onChange={() => toggle(option.id)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span>
                    {option.name}
                    {/* FR-094: a value awaiting review must not look authoritative. */}
                    {option.is_draft ? (
                      <span className="ml-2 text-xs text-warning">(DRAFT — NEEDS REVIEW)</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {error ? (
        <div id={`${groupId}-error`} className="mt-1 text-xs text-danger">
          {error}
        </div>
      ) : helperText ? (
        <div className="mt-1 text-xs text-textMuted">{helperText}</div>
      ) : null}
    </fieldset>
  );
}
