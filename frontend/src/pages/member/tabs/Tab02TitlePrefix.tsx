import { RepeatableRows } from "../../../components/ui/RepeatableRows";
import { Select } from "../../../components/ui/Select";
import { EMPTY_LOOKUP_NOTE, lookupOptions, toNullableId, yearOptions } from "./shared";
import type { TabProps } from "./shared";
import type { TitleEntry } from "../../../features/member/memberApi";

/** FR-044, FR-046. A fixed window named in the requirement, not a rolling one. */
const YEAR_MIN = 1950;
const YEAR_MAX = 2026;

/**
 * Tab 2 — Title and Prefix.
 *
 * FR-043: the Prefix is NOT editable here. It is whatever was chosen on Tab 1, shown only
 * when it is not None and hidden entirely when it is. Editing it in two places would let the
 * two disagree, and the brief asks for it to be displayed, not re-entered — so this tab owns
 * only the Prefix *Year*.
 *
 * A consequence worth stating: with no prefix chosen there is nothing for a Prefix Year to
 * qualify, so that field goes too. The member is told why rather than being shown a year
 * dropdown with no subject.
 */
export function Tab02TitlePrefix({ value, lookups, errorFor, onChange, disabled }: TabProps) {
  const prefix = value.first_prefix;
  const hasPrefix = prefix !== null && prefix !== "" && prefix !== "None";

  const titles = value.titles ?? [];

  function setTitles(rows: TitleEntry[]) {
    onChange("titles", rows);
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 text-sm font-semibold">Prefix</div>

        {hasPrefix ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Read-only: Tab 1 owns this value (FR-043). */}
            <div>
              <div className="mb-1 text-sm font-semibold">Prefix</div>
              <div className="rounded-input border border-border bg-surface px-3 py-2 text-sm">
                {prefix}
              </div>
              <div className="mt-1 text-xs text-textMuted">
                Chosen on the Personal tab. Change it there.
              </div>
            </div>

            <Select
              label="Prefix Year"
              value={value.prefix_year == null ? "" : String(value.prefix_year)}
              onChange={(e) => onChange("prefix_year", toNullableId(e.target.value))}
              options={yearOptions(YEAR_MIN, YEAR_MAX)}
              error={errorFor("prefix_year")}
              disabled={disabled}
            />
          </div>
        ) : (
          <div className="rounded-input border border-border bg-surface p-3 text-sm text-textMuted">
            You have not chosen a First Prefix. Choose Sheikh or Mulla on the Personal tab and
            it will appear here with its year.
          </div>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <RepeatableRows<TitleEntry>
          legend="Titles"
          itemNoun="title"
          rows={titles}
          onChange={setTitles}
          // 0 rather than a guessed year: the member must choose, and 0 fails validation
          // loudly if they do not.
          newRow={() => ({ title_id: 0, title_year: 0 })}
          emptyNote="No titles added yet. Add one for each title you hold, with the year you received it."
          addDisabledReason={
            lookups.titles.length === 0
              ? `Titles have not been set up yet. ${EMPTY_LOOKUP_NOTE}`
              : undefined
          }
          disabled={disabled}
          rowError={(index) => errorFor(`titles[${index}]`)}
          renderRow={(row, index, update) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Title"
                value={row.title_id === 0 ? "" : String(row.title_id)}
                onChange={(e) => update({ ...row, title_id: Number(e.target.value || 0) })}
                options={lookupOptions(lookups.titles)}
                error={errorFor(`titles[${index}].title_id`)}
                disabled={disabled}
              />
              <Select
                label="Title Year"
                value={row.title_year === 0 ? "" : String(row.title_year)}
                onChange={(e) => update({ ...row, title_year: Number(e.target.value || 0) })}
                options={yearOptions(YEAR_MIN, YEAR_MAX)}
                error={errorFor(`titles[${index}].title_year`)}
                disabled={disabled}
              />
            </div>
          )}
        />
      </div>
    </div>
  );
}
