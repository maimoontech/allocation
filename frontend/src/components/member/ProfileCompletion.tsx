import { formatDateDdMmmYy } from "../../utils/formatDate";

/**
 * How much of their own twelve-tab form a member has filled in, and when they last saved it.
 *
 * SHARED BETWEEN PANELS ON PURPOSE (FR-112b, FR-112c)
 *   The administrator's Members list and the party's own roster both show this. If each drew
 *   it, the two would drift - different thresholds, different wording, one showing a bare
 *   percentage and the other a fraction - and an operator comparing what two screens say
 *   about the same member would be comparing two different claims.
 *
 *   It takes numbers rather than a member object, because the two panels return different
 *   shapes and neither should have to grow the other's fields to reuse a cell.
 *
 * THE NUMBER IS THE ANSWER; THE BAR IS FOR SCANNING
 *   The percentage is text, so it is readable by a screen reader, copyable, and legible to
 *   anyone who cannot distinguish the colours. The bar exists because the question an
 *   operator actually has is "who is behind?", and twenty-five two-digit numbers in a column
 *   do not answer that at a glance. It is `aria-hidden` for the same reason: it repeats the
 *   number rather than adding to it.
 *
 * WHY THE FRACTION IS SPELLED OUT
 *   The denominator is not the same for every member - it counts only the questions that
 *   member was asked, so a Student and a shopkeeper are measured out of different totals
 *   (FR-112). A bare percentage invites "out of what?", and the answer is per member.
 *
 * THRESHOLDS
 *   Deliberately coarse: under a third is behind, a third to two thirds is in progress, above
 *   that is close. Finer bands would imply a precision the measure does not have.
 */
export function ProfileCompletionCell({
  percent,
  answered,
  asked
}: {
  percent: number;
  answered: number;
  asked: number;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const tone = clamped >= 67 ? "bg-primary" : clamped >= 34 ? "bg-warning" : "bg-danger";

  return (
    <div className="min-w-[5.5rem]">
      <div className="font-semibold">{clamped}%</div>
      <div
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface"
        aria-hidden="true"
      >
        <div className={`h-full ${tone}`} style={{ width: `${clamped}%` }} />
      </div>
      <div className="mt-1 whitespace-nowrap text-xs text-textMuted">
        {answered} of {asked}
      </div>
    </div>
  );
}

/**
 * Whole days between a past moment and now, or null when the date cannot be read.
 *
 * Compared at midnight rather than by elapsed hours, so a profile saved late last night reads
 * as "yesterday" and not as "today" - which is what somebody looking at the column means by
 * the word.
 */
export function daysSince(value: string | null, now: Date = new Date()): number | null {
  if (!value) return null;

  const then = new Date(value);
  if (!Number.isFinite(then.getTime())) return null;

  const midnight = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

  const days = Math.round((midnight(now) - midnight(then)) / 86400000);
  // A clock skew between the browser and the server can put a save slightly in the future.
  // "In 1 day" would be nonsense to read, so anything not in the past is today.
  return days < 0 ? 0 : days;
}

/** "Today", "Yesterday", "6 days ago", "3 months ago" - the shape a person would say. */
export function describeDaysSince(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 31) return `${days} days ago`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;

  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/**
 * When the profile was last saved.
 *
 * THE RELATIVE LINE IS THE POINT, NOT THE DATE
 *   This column exists so a party leader or an administrator can see who has gone quiet. "Six
 *   months ago" answers that; "12/May/26" makes the reader do the arithmetic. Both are shown,
 *   because the exact date is what gets quoted back in a conversation.
 *
 * STALENESS IS MARKED, NOT RANKED
 *   Only a gap of six months or more is coloured. A profile untouched for a week is normal and
 *   colouring it would make the column noise; half a year is the point at which "have they
 *   stopped?" becomes a fair question.
 */
export function LastUpdatedCell({ updatedAt }: { updatedAt: string | null }) {
  if (!updatedAt) {
    return <span className="text-textMuted">Never saved</span>;
  }

  const days = daysSince(updatedAt);
  const stale = days !== null && days >= 183;

  return (
    <div className="min-w-[6.5rem]">
      <div className={stale ? "font-semibold text-warning" : "font-semibold"}>
        {describeDaysSince(days)}
      </div>
      <div className="mt-1 whitespace-nowrap text-xs text-textMuted">
        {formatDateDdMmmYy(updatedAt)}
      </div>
    </div>
  );
}
