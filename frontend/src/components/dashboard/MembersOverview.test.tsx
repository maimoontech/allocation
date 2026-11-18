import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { MembersOverview } from "./MembersOverview";
import { renderWithProviders } from "../../test-utils";
import type { MemberDashboard } from "../../features/member/memberDashboardApi";

/**
 * The administrator's member dashboard (FR-112).
 *
 * Two things are worth testing here and the rest is layout. First, that signing in and
 * choosing a password are reported as the SEPARATE figures they are, with the gap between
 * them named — collapsing them would hide the member who got in, met the forced password
 * change and stopped. Second, that the page says what its percentage counted: the profile
 * has no mandatory fields, so the figure is a definition, and a definition that is not on
 * the page gets misquoted.
 */

const DASHBOARD: MemberDashboard = {
  access: {
    total: 137,
    active: 130,
    inactive: 7,
    signed_in: 92,
    never_signed_in: 45,
    changed_password: 81,
    signed_in_not_changed: 11,
    signed_in_percent: 67,
    changed_password_percent: 59
  },
  form: {
    measured: 130,
    average_percent: 43,
    fully_answered: 12,
    partly_answered: 91,
    not_started: 27,
    fully_answered_percent: 9,
    questions_asked: 5590,
    questions_answered: 2404,
    tabs: [
      { tab: 1, label: "Personal", asked: 1430, answered: 1115, percent: 78 },
      { tab: 2, label: "Title & Prefix", asked: 40, answered: 10, percent: 25 },
      { tab: 3, label: "Hizb", asked: 780, answered: 390, percent: 50 },
      { tab: 4, label: "Occupation", asked: 780, answered: 234, percent: 30 },
      { tab: 5, label: "Education / Hifz", asked: 1040, answered: 312, percent: 30 },
      { tab: 6, label: "Health & Fitness", asked: 520, answered: 156, percent: 30 },
      { tab: 10, label: "Asbaq", asked: 260, answered: 52, percent: 20 },
      { tab: 11, label: "Tamreen", asked: 780, answered: 78, percent: 10 },
      { tab: 12, label: "Other Sansta Khidmat", asked: 520, answered: 57, percent: 11 }
    ]
  },
  generated_at: "2026-11-18T09:00:00.000Z"
};

let failure: { status: number; message: string } | null = null;
let requested: string[] = [];

function envelope(data: unknown, status = 200, message = "OK"): Response {
  return new Response(JSON.stringify({ success: status < 400, data, message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

beforeEach(() => {
  failure = null;
  requested = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const isRequest = typeof Request !== "undefined" && input instanceof Request;
      const url = isRequest ? input.url : String(input);
      requested.push(url);

      if (url.includes("/member-dashboard")) {
        if (failure) return envelope(null, failure.status, failure.message);
        return envelope(DASHBOARD);
      }
      return envelope({});
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderOverview() {
  renderWithProviders(<MembersOverview />);
  await waitFor(() => expect(screen.getByText("Member accounts")).toBeInTheDocument());
}

describe("MembersOverview", () => {
  it("asks the server for the counts", async () => {
    await renderOverview();

    expect(requested.some((u) => u.includes("/member-dashboard"))).toBe(true);
  });

  it("shows how many accounts exist, in total and active", async () => {
    await renderOverview();

    expect(screen.getByText("137")).toBeInTheDocument();
    // One assertion, not two: "130 active" alone also matches the completion heading below.
    expect(screen.getByText("130 active, 7 deactivated")).toBeInTheDocument();
  });

  /** The question asked: how many have logged in and changed their password. */
  it("reports signing in and choosing a password as two separate figures", async () => {
    await renderOverview();

    expect(screen.getByText("Signed in")).toBeInTheDocument();
    expect(screen.getByText("92")).toBeInTheDocument();
    expect(screen.getByText(/67% have logged in at least once/)).toBeInTheDocument();

    expect(screen.getByText("Set their own password")).toBeInTheDocument();
    expect(screen.getByText("81")).toBeInTheDocument();
    expect(
      screen.getByText(/59% no longer use the password they were issued/)
    ).toBeInTheDocument();
  });

  it("counts those who have never signed in at all", async () => {
    await renderOverview();

    expect(screen.getByText("Never signed in")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
  });

  /**
   * The gap between the two middle figures is the only group on this page somebody can help
   * today, so it is named rather than left to be worked out by subtraction.
   */
  it("names the members who signed in but are still on the issued password", async () => {
    await renderOverview();

    expect(screen.getByText("11")).toBeInTheDocument();
    expect(
      screen.getByText(/signed in but.*still on the password they were issued/s)
    ).toBeInTheDocument();
  });

  it("says nothing about that gap when nobody is in it", async () => {
    const none = {
      ...DASHBOARD,
      access: { ...DASHBOARD.access, signed_in_not_changed: 0 }
    };
    vi.stubGlobal("fetch", vi.fn(async () => envelope(none)));

    await renderOverview();

    expect(
      screen.queryByText(/still on the password they were issued/)
    ).not.toBeInTheDocument();
  });

  it("shows the average share of the form that is filled in", async () => {
    await renderOverview();

    expect(screen.getByText("Average profile filled in")).toBeInTheDocument();
    expect(screen.getByText("43%")).toBeInTheDocument();
    expect(screen.getByText(/2,404 of 5,590 questions answered/)).toBeInTheDocument();
  });

  it("splits members into finished, started and untouched", async () => {
    await renderOverview();

    expect(screen.getByText("Answered everything")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Partly filled in")).toBeInTheDocument();
    expect(screen.getByText("91")).toBeInTheDocument();
    expect(screen.getByText("Not started")).toBeInTheDocument();
    expect(screen.getByText("27")).toBeInTheDocument();
  });

  /**
   * The profile has no mandatory fields, so this percentage is a definition rather than a
   * measurement. Printing what it counted is what keeps it from being misquoted.
   */
  it("states on the page what the percentage counted", async () => {
    await renderOverview();

    expect(screen.getByText(/never shown Designation/)).toBeInTheDocument();
    expect(screen.getByText(/having none to enter is not the same as leaving them blank/))
      .toBeInTheDocument();
  });

  it("breaks the figure down by tab", async () => {
    await renderOverview();

    expect(screen.getByText("By tab")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();
    expect(screen.getByText("Other Sansta Khidmat")).toBeInTheDocument();
    // Tabs 7, 8 and 9 are lists, and an empty list is not an unanswered one.
    expect(screen.queryByText("Sharaf")).not.toBeInTheDocument();
    expect(screen.queryByText("Ashara Mubaraka")).not.toBeInTheDocument();
  });

  it("explains a failure and offers to try again", async () => {
    failure = { status: 500, message: "Failed to load the member dashboard" };
    renderWithProviders(<MembersOverview />);

    await waitFor(() =>
      expect(screen.getByText("Failed to load the member dashboard")).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
