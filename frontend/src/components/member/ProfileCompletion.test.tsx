import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  LastUpdatedCell,
  ProfileCompletionCell,
  daysSince,
  describeDaysSince
} from "./ProfileCompletion";

/**
 * The two cells the administrator's Members list and the party's roster share (FR-112b,
 * FR-112c).
 *
 * Tested here once rather than through each page. The point of extracting them was that the
 * two screens must not be able to say different things about the same member, and a test per
 * page would have been two chances to assert two different behaviours.
 */

describe("ProfileCompletionCell", () => {
  it("shows the percentage as text, so it is readable and copyable", () => {
    render(<ProfileCompletionCell percent={76} answered={32} asked={42} />);

    expect(screen.getByText("76%")).toBeInTheDocument();
  });

  it("spells out the fraction, because the denominator is per member", () => {
    render(<ProfileCompletionCell percent={76} answered={32} asked={42} />);

    expect(screen.getByText("32 of 42")).toBeInTheDocument();
  });

  /** A member with no profile row scores 0% against a real denominator, not 0 of 0. */
  it("renders a member who has answered nothing", () => {
    render(<ProfileCompletionCell percent={0} answered={0} asked={40} />);

    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("0 of 40")).toBeInTheDocument();
  });

  /**
   * A server that has not been redeployed sends no completion fields at all, which arrives
   * here as `undefined`. "NaN%" in a column of percentages is worse than a wrong number,
   * because it reads as a broken page rather than as missing data.
   */
  it("shows 0% rather than NaN when the figure is missing", () => {
    render(
      <ProfileCompletionCell
        percent={undefined as unknown as number}
        answered={0}
        asked={0}
      />
    );

    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("clamps a figure outside 0 to 100", () => {
    const { rerender } = render(<ProfileCompletionCell percent={130} answered={1} asked={1} />);
    expect(screen.getByText("100%")).toBeInTheDocument();

    rerender(<ProfileCompletionCell percent={-5} answered={0} asked={1} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  /** The bar repeats the number rather than adding to it, so it is hidden from readers. */
  it("hides the bar from assistive technology", () => {
    const { container } = render(
      <ProfileCompletionCell percent={50} answered={21} asked={42} />
    );

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe("daysSince", () => {
  /**
   * Built in LOCAL time, not from a `Z` string, and that is the test as much as the subject.
   *
   * `daysSince` compares local calendar days on purpose: "yesterday" means yesterday where
   * the person reading the screen is, not in UTC. So a fixture written as
   * `2026-11-25T23:30:00Z` is late on the 25th in London and already the 26th in Karachi, and
   * a test asserting "1 day" on it passes or fails according to where it runs. The first
   * draft of this file did exactly that and failed here, correctly.
   */
  const at = (year: number, month: number, day: number, hour = 10, minute = 0) =>
    new Date(year, month - 1, day, hour, minute).toISOString();

  const now = new Date(2026, 10, 26, 10, 0);

  it("counts whole days from midnight, not elapsed hours", () => {
    // Saved late the previous evening: a person calls that yesterday, not today.
    expect(daysSince(at(2026, 11, 25, 23, 30), now)).toBe(1);
    expect(daysSince(at(2026, 11, 26, 0, 5), now)).toBe(0);
  });

  it("counts a longer gap", () => {
    expect(daysSince(at(2026, 11, 19), now)).toBe(7);
    expect(daysSince(at(2026, 2, 10), now)).toBe(289);
  });

  /** Clock skew between a browser and the server can date a save slightly in the future. */
  it("treats a future date as today rather than counting backwards", () => {
    expect(daysSince(at(2026, 11, 27), now)).toBe(0);
  });

  it("returns null for nothing and for something unreadable", () => {
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince("not a date", now)).toBeNull();
  });
});

describe("describeDaysSince", () => {
  it("uses the words a person would use", () => {
    expect(describeDaysSince(0)).toBe("Today");
    expect(describeDaysSince(1)).toBe("Yesterday");
    expect(describeDaysSince(6)).toBe("6 days ago");
  });

  it("switches to months, then to years", () => {
    expect(describeDaysSince(60)).toBe("2 months ago");
    expect(describeDaysSince(289)).toBe("10 months ago");
    expect(describeDaysSince(400)).toBe("1 year ago");
    expect(describeDaysSince(900)).toBe("2 years ago");
  });

  it("says nothing when there is no date", () => {
    expect(describeDaysSince(null)).toBe("");
  });
});

describe("LastUpdatedCell", () => {
  it("shows how long ago and the exact date", () => {
    render(<LastUpdatedCell updatedAt="2026-02-10T08:30:00.000Z" />);

    expect(screen.getByText("10/Feb/26")).toBeInTheDocument();
    expect(screen.getByText(/ago/)).toBeInTheDocument();
  });

  /**
   * A profile row always has an `updated_at`, so this is the defensive case rather than the
   * expected one - but "Never saved" is the honest reading and an empty cell is not.
   */
  it("says Never saved rather than leaving the cell empty", () => {
    render(<LastUpdatedCell updatedAt={null} />);

    expect(screen.getByText("Never saved")).toBeInTheDocument();
  });

  /** Half a year is where "have they stopped?" becomes a fair question. A week is not. */
  it("marks a long gap and leaves a recent save plain", () => {
    const recent = new Date(Date.now() - 7 * 86400000).toISOString();
    const stale = new Date(Date.now() - 300 * 86400000).toISOString();

    const { container: fresh } = render(<LastUpdatedCell updatedAt={recent} />);
    expect(fresh.querySelector(".text-warning")).toBeNull();

    const { container: old } = render(<LastUpdatedCell updatedAt={stale} />);
    expect(old.querySelector(".text-warning")).not.toBeNull();
  });
});
