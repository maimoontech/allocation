import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
  filter: { zone_id: null, mohallah_id: null },
  generated_at: "2026-11-18T09:00:00.000Z"
};

const ZONES = [
  { id: 2, zone_name: "South", coordinator_name: "A", contact_number: null, whatsapp_number: null, last_login_at: null, created_at: "", updated_at: "" },
  { id: 1, zone_name: "North", coordinator_name: "B", contact_number: null, whatsapp_number: null, last_login_at: null, created_at: "", updated_at: "" }
];

const MOHALLAHS = [
  { id: 9, zone_id: 1, zone_name: "North", mohallah_name: "Saifee", coordinator_name: "C", contact_number: null, whatsapp_number: null, last_login_at: null, created_at: "" },
  { id: 8, zone_id: 2, zone_name: "South", mohallah_name: "Burhani", coordinator_name: "D", contact_number: null, whatsapp_number: null, last_login_at: null, created_at: "" }
];

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
      if (url.includes("/zones")) return envelope(ZONES);
      if (url.includes("/mohallahs")) return envelope(MOHALLAHS);
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
    // Still URL-aware: a stub that answers every request with the dashboard would hand the
    // zone dropdown an object where it expects a list.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.includes("/zones")) return envelope(ZONES);
        if (url.includes("/mohallahs")) return envelope(MOHALLAHS);
        return envelope(none);
      })
    );

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
    // Scoped to the list: "Personal" is also the name of a tab referred to in the prose
    // above, and an unscoped query matches both.
    const list = within(screen.getByRole("list", { name: "Completion by tab" }));
    expect(list.getByText("Personal")).toBeInTheDocument();
    expect(list.getByText("78%")).toBeInTheDocument();
    expect(list.getByText("Other Sansta Khidmat")).toBeInTheDocument();
    // Tabs 7, 8 and 9 are lists, and an empty list is not an unanswered one.
    expect(list.queryByText("Sharaf")).not.toBeInTheDocument();
    expect(list.queryByText("Ashara Mubaraka")).not.toBeInTheDocument();
  });

  /**
   * FR-112a. The filters.
   *
   * Two things are worth pinning down. That "not chosen yet" is offered at all — it is the
   * only way to reach the members a plain zone filter hides, and those are the ones the
   * figures exist to find. And that the Mohallah list is NOT narrowed by the chosen Zone:
   * Zone is the member's Hizb and Mohallah is where they live, so narrowing one by the other
   * would hide combinations that genuinely occur.
   */
  describe("the Zone and Mohallah filters", () => {
    it("offers every zone, alphabetically, with an All and a not-chosen option", async () => {
      await renderOverview();

      const select = screen.getByLabelText("Zone") as HTMLSelectElement;
      expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
        "All zones",
        "Zone not chosen yet",
        "North",
        "South"
      ]);
    });

    it("offers every mohallah with its zone named, alphabetically", async () => {
      await renderOverview();

      const select = screen.getByLabelText("Mohallah") as HTMLSelectElement;
      expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
        "All mohallahs",
        "Mohallah not chosen yet",
        "Burhani (South)",
        "Saifee (North)"
      ]);
    });

    it("asks the server for nothing extra until a filter is chosen", async () => {
      await renderOverview();

      const dashboardCalls = requested.filter((u) => u.includes("/member-dashboard"));
      expect(dashboardCalls).toHaveLength(1);
      expect(dashboardCalls[0]).not.toContain("zone_id");
      expect(dashboardCalls[0]).not.toContain("mohallah_id");
    });

    it("sends the chosen zone to the server", async () => {
      await renderOverview();

      fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "1" } });

      await waitFor(() =>
        expect(requested.some((u) => u.includes("zone_id=1"))).toBe(true)
      );
    });

    it("sends the chosen mohallah to the server", async () => {
      await renderOverview();

      fireEvent.change(screen.getByLabelText("Mohallah"), { target: { value: "8" } });

      await waitFor(() =>
        expect(requested.some((u) => u.includes("mohallah_id=8"))).toBe(true)
      );
    });

    it("sends both together, because they are independent answers", async () => {
      await renderOverview();

      fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "2" } });
      fireEvent.change(screen.getByLabelText("Mohallah"), { target: { value: "9" } });

      await waitFor(() =>
        expect(
          requested.some((u) => u.includes("zone_id=2") && u.includes("mohallah_id=9"))
        ).toBe(true)
      );
    });

    /** The members a plain zone filter would hide: no zone chosen, or no profile at all. */
    it("can ask for the members who have chosen no zone", async () => {
      await renderOverview();

      fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "none" } });

      await waitFor(() =>
        expect(requested.some((u) => u.includes("zone_id=none"))).toBe(true)
      );
    });

    it("does not narrow the mohallah list when a zone is chosen", async () => {
      await renderOverview();

      fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "1" } });

      // All of them still, including the one belonging to the other zone.
      const select = screen.getByLabelText("Mohallah") as HTMLSelectElement;
      expect(Array.from(select.options).map((o) => o.textContent)).toContain("Burhani (South)");
    });

    it("says that the figures are filtered, and to what", async () => {
      await renderOverview();
      expect(screen.queryByText(/Every figure below counts only/)).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "1" } });

      // Named inside the banner, not anywhere on the page: "North" is also a dropdown option.
      await waitFor(() =>
        expect(screen.getByText(/Every figure below counts only/).textContent).toMatch(
          /North/
        )
      );
    });

    /** Every figure reading zero looks like a membership that has done nothing. */
    it("says when a filter matches nobody rather than showing a page of zeroes", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = input instanceof Request ? input.url : String(input);
          if (url.includes("/zones")) return envelope(ZONES);
          if (url.includes("/mohallahs")) return envelope(MOHALLAHS);
          if (url.includes("zone_id=2")) {
            return envelope({
              ...DASHBOARD,
              access: { ...DASHBOARD.access, total: 0, active: 0, inactive: 0 }
            });
          }
          return envelope(DASHBOARD);
        })
      );

      await renderOverview();
      fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "2" } });

      await waitFor(() =>
        expect(screen.getByText(/No member accounts match/)).toBeInTheDocument()
      );
      expect(screen.queryByText("Average profile filled in")).not.toBeInTheDocument();
    });

    /** A failure that cleared the filters would make the operator pick them again to retry. */
    it("keeps the filters on screen when the request fails", async () => {
      failure = { status: 500, message: "Failed to load the member dashboard" };
      renderWithProviders(<MembersOverview />);

      await waitFor(() =>
        expect(screen.getByText("Failed to load the member dashboard")).toBeInTheDocument()
      );
      expect(screen.getByLabelText("Zone")).toBeInTheDocument();
      expect(screen.getByLabelText("Mohallah")).toBeInTheDocument();
    });
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
