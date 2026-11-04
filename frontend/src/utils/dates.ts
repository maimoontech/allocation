/**
 * Date helpers for form fields.
 *
 * Kept out of the DatePicker component file: a module that exports both a component and a
 * plain function defeats React Fast Refresh, which can then only reload by remounting the
 * whole tree — losing form state as you edit.
 */

/** Today as `YYYY-MM-DD`, the format every date field and the API use. */
export function todayIso(now: Date = new Date()): string {
  return [
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
}
