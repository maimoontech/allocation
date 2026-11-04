import { RepeatableRows } from "../../../components/ui/RepeatableRows";
import { Select } from "../../../components/ui/Select";
import { EMPTY_LOOKUP_NOTE, lookupOptions, yearOptions } from "./shared";
import type { TabProps } from "./shared";
import type { SharafEntry } from "../../../features/member/memberApi";

/**
 * FR-068. The same window as Tab 2's years, for consistency across the form — the server
 * applies the same bounds.
 */
const YEAR_MIN = 1950;
const YEAR_MAX = 2026;

/**
 * Tab 7 — Sharaf.
 *
 * The simplest of the four repeatable tabs: one lookup and one year per row, with no
 * conditional rules and no cross-row arithmetic.
 *
 * The `sharafs` lookup is one of the five that ship empty, so Add is blocked with an
 * explanation rather than offering a row whose only dropdown has nothing in it (FR-095).
 */
export function Tab07Sharaf({ value, lookups, errorFor, onChange, disabled }: TabProps) {
  const sharafs = value.sharafs ?? [];

  return (
    <div className="space-y-4">
      <div className="text-sm text-textMuted">
        Add one entry for each Sharaf you have received, with the year.
      </div>

      <RepeatableRows<SharafEntry>
        legend="Sharaf"
        itemNoun="sharaf"
        rows={sharafs}
        onChange={(rows) => onChange("sharafs", rows)}
        newRow={() => ({ sharaf_id: 0, sharaf_year: 0 })}
        emptyNote="No Sharaf entries added yet."
        addDisabledReason={
          lookups.sharafs.length === 0
            ? `Sharaf options have not been set up yet. ${EMPTY_LOOKUP_NOTE}`
            : undefined
        }
        disabled={disabled}
        rowError={(index) => errorFor(`sharafs[${index}]`)}
        renderRow={(row, index, update) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Sharaf"
              value={row.sharaf_id === 0 ? "" : String(row.sharaf_id)}
              onChange={(e) => update({ ...row, sharaf_id: Number(e.target.value || 0) })}
              options={lookupOptions(lookups.sharafs)}
              error={errorFor(`sharafs[${index}].sharaf_id`)}
              disabled={disabled}
            />
            <Select
              label="Year"
              value={row.sharaf_year === 0 ? "" : String(row.sharaf_year)}
              onChange={(e) => update({ ...row, sharaf_year: Number(e.target.value || 0) })}
              options={yearOptions(YEAR_MIN, YEAR_MAX)}
              error={errorFor(`sharafs[${index}].sharaf_year`)}
              disabled={disabled}
            />
          </div>
        )}
      />
    </div>
  );
}
