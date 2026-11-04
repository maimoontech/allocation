import type { ReactNode } from "react";
import { Button } from "./Button";

export type RepeatableRowsProps<T> = {
  /** Names the collection, e.g. "Titles". Used for the legend and the button labels. */
  legend: string;
  /** Singular noun for the per-row controls, e.g. "title" in "Remove title 2". */
  itemNoun: string;
  rows: T[];
  /** Called with the whole new array. The component keeps no state of its own. */
  onChange: (rows: T[]) => void;
  /** Builds a blank row. Called on Add. */
  newRow: () => T;
  /**
   * Renders one row's fields. `update` replaces that row — for an object row, spread it:
   * `update({ ...row, title_year: year })`.
   */
  renderRow: (row: T, index: number, update: (next: T) => void) => ReactNode;
  /** A server error for the row as a whole, e.g. the Tab 8 count mismatch. */
  rowError?: (index: number) => string | undefined;
  /** Shown in place of the rows when there are none. */
  emptyNote?: string;
  /** Blocks Add — used when the lookup a row depends on is empty. */
  addDisabledReason?: string;
  disabled?: boolean;
};

/**
 * Add / edit / remove editor for a repeatable profile section (Tabs 2, 7, 8 and 9).
 *
 * THE COMPONENT HOLDS NO ROW STATE. Every change goes out through `onChange` to the page's
 * draft in `memberProfileSlice`, and the rows come back in as a prop. That is not incidental
 * tidiness — only the active tab panel is rendered (FR-026), so a half-entered row kept in
 * local state would be destroyed the moment the member looked at another tab. Keeping the
 * rows in the draft is what makes a four-tab form with unsaved work survive navigation, and
 * it is why Add appends a blank row to the draft rather than opening a dialog.
 *
 * Rows are identified by POSITION, which is also how the server reports errors on them
 * (`titles[1].title_year`). Removing a row therefore renumbers the ones after it; this is
 * fine because the whole section is replaced on save, but it does mean a stale server error
 * can point at a row that has since moved. The page clears errors for a field prefix as soon
 * as that section changes, so a message cannot outlive the edit that caused it.
 *
 * Deliberately NOT a drag-to-reorder list: nothing in the twelve tabs depends on row order,
 * the server returns each section ordered by its own key, and the member never sees a
 * position number.
 */
export function RepeatableRows<T>({
  legend,
  itemNoun,
  rows,
  onChange,
  newRow,
  renderRow,
  rowError,
  emptyNote,
  addDisabledReason,
  disabled
}: RepeatableRowsProps<T>) {
  function update(index: number, next: T) {
    onChange(rows.map((row, i) => (i === index ? next : row)));
  }

  function remove(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...rows, newRow()]);
  }

  return (
    <fieldset className="block">
      <legend className="mb-2 text-sm font-semibold">{legend}</legend>

      {rows.length === 0 ? (
        <div className="mb-3 rounded-input border border-dashed border-border p-3 text-sm text-textMuted">
          {emptyNote ?? `No ${itemNoun} added yet.`}
        </div>
      ) : (
        <div className="mb-3 space-y-3">
          {rows.map((row, index) => {
            const error = rowError?.(index);
            return (
              <div
                // Position is the only identity a row has; see the note above.
                key={index}
                className={[
                  "rounded-card border bg-surface p-3",
                  error ? "border-danger" : "border-border"
                ].join(" ")}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-textMuted">
                    {itemNoun} {index + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2 py-1 text-xs text-danger"
                    onClick={() => remove(index)}
                    disabled={disabled}
                    aria-label={`Remove ${itemNoun} ${index + 1}`}
                  >
                    Remove
                  </Button>
                </div>

                {renderRow(row, index, (next) => update(index, next))}

                {error ? <div className="mt-2 text-xs text-danger">{error}</div> : null}
              </div>
            );
          })}
        </div>
      )}

      <Button
        type="button"
        variant="secondary"
        onClick={add}
        disabled={disabled || Boolean(addDisabledReason)}
        title={addDisabledReason}
      >
        Add {itemNoun}
      </Button>

      {addDisabledReason ? (
        <div className="mt-2 text-xs text-warning">{addDisabledReason}</div>
      ) : null}
    </fieldset>
  );
}
