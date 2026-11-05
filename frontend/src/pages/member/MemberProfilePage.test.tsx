import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemberProfilePage } from "./MemberProfilePage";
import { renderWithProviders } from "../../test-utils";

/**
 * The twelve-tab shell, Tab 1 and Tab 3.
 *
 * The claim worth testing above all others is FR-026: only the active panel is rendered, so
 * if unsaved values lived in the inputs they would vanish on every tab switch. They live in
 * the profile slice instead. "Type into Tab 1, go to Tab 3, come back" is the whole point.
 *
 * `fetch` is stubbed rather than MSW-mocked, because the page makes exactly three calls and
 * the shapes are small enough to state inline.
 */

const PROFILE = {
  its_no: "99900101",
  has_photo: false,
  updated_at: "2026-10-30T10:00:00.000Z",
  first_prefix: "None",
  name: null,
  father_prefix: "None",
  father_name: null,
  surname: null,
  dob_gregorian: null,
  dob_hijri_day: null,
  dob_hijri_month: null,
  dob_hijri_year: null,
  dob_hijri_text: null,
  marital_status_id: null,
  residence_address: null,
  phone_no: null,
  mobile_no_1: null,
  mobile_no_2: null,
  whatsapp_no_1: null,
  whatsapp_no_2: null,
  email: null,
  prefix_year: null,
  zone_id: null,
  party_id: null,
  hizb_role: null,
  bmi: null,
  titles: [],
  sharafs: [],
  skill_ids: [],
  places_visited: [],
  ashara_attendances: []
};

const LOOKUPS = {
  titles: [],
  sharafs: [],
  halqas: [],
  mozes: [],
  aqa_moula_asharas: [],
  places: [],
  sanads: [],
  marital_statuses: [{ id: 1, name: "Married", is_draft: true }],
  skills: [],
  tamreen_frequencies: [],
  tamreen_methods: [],
  zones: [
    { id: 1, name: "Zone One", is_draft: false },
    { id: 2, name: "Zone Two", is_draft: false }
  ],
  parties: [
    { id: 10, name: "Hizb In One", zone_id: 1, is_active: true },
    { id: 20, name: "Hizb In Two", zone_id: 2, is_active: true },
    // Deactivated, and in Zone One. Tab 3 must still offer it (FR-048a).
    { id: 11, name: "Hizb Retired", zone_id: 1, is_active: false }
  ],
  mohallahs: [],
  current_hijri_year: 1448
};

/**
 * A REAL Response, not a hand-rolled object.
 *
 * `fetchBaseQuery` does more with the response than call `text()` — it inspects headers and
 * may clone it — so a partial stub leaves the query stuck in its loading state with no error
 * to show. jsdom provides the genuine class, so there is no reason to fake it.
 */
function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data, message: "OK" }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

let saveBodies: unknown[] = [];
let saveCount = 0;

/**
 * Each save gets a FRESH `updated_at`, because the real server stamps one on every write.
 * A stub that echoed the original would hide the whole class of bug this file now covers:
 * the page re-basing its concurrency stamp after a save.
 */
const savedUpdatedAt = (n: number) => `2026-10-30T10:0${n}:00.000Z`;

beforeEach(() => {
  saveBodies = [];
  saveCount = 0;
  sessionStorage.clear();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      // fetchBaseQuery calls fetch with a single Request object, not (url, init). Reading
      // the method and body off `init` alone silently treats every call as a GET.
      const isRequest = typeof Request !== "undefined" && input instanceof Request;
      const url = isRequest ? input.url : String(input);
      const method = (isRequest ? input.method : init?.method) ?? "GET";

      if (url.includes("/members/lookups")) return envelope(LOOKUPS);

      if (url.includes("/members/me/profile")) {
        if (method.toUpperCase() === "PUT") {
          const raw = isRequest ? await input.clone().text() : String(init?.body ?? "{}");
          saveBodies.push(JSON.parse(raw));
          saveCount += 1;
          return envelope({ ...PROFILE, name: "Saved", updated_at: savedUpdatedAt(saveCount) });
        }
        return envelope(PROFILE);
      }

      return envelope({});
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The identifier fields put helper text inside the label, so match by prefix. */
const nameField = () => screen.getByLabelText(/^Name/) as HTMLInputElement;

describe("MemberProfilePage", () => {
  it("renders all twelve tabs", async () => {
    renderWithProviders(<MemberProfilePage />);
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(12));
  });

  it("shows the member's ITS number read-only", async () => {
    renderWithProviders(<MemberProfilePage />);

    const field = await waitFor(() => screen.getByLabelText(/^ITS No\./) as HTMLInputElement);
    expect(field.value).toBe("99900101");
    expect(field).toHaveAttribute("readonly");
  });

  /**
   * FR-026 — the reason the draft lives in the slice.
   */
  it("keeps typed values when moving between tabs and back", async () => {
    renderWithProviders(<MemberProfilePage />);
    await waitFor(() => expect(nameField()).toBeInTheDocument());

    fireEvent.change(nameField(), { target: { value: "Typed On Tab One" } });

    fireEvent.click(screen.getByRole("tab", { name: /Hizb/ }));
    await waitFor(() => expect(screen.getByLabelText("Zone")).toBeInTheDocument());
    // Tab 1's input is genuinely gone, not merely hidden.
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Personal/ }));
    await waitFor(() => expect(nameField()).toBeInTheDocument());
    expect(nameField().value).toBe("Typed On Tab One");
  });

  /**
   * The same guarantee as above, across the whole form rather than one hop.
   *
   * This replaced a test that visited a tab which had not been built yet — every tab now
   * exists, so that test had no subject. Walking all twelve is the stronger version anyway:
   * it would catch a single tab whose mount or unmount disturbed the draft, which a single
   * there-and-back could not.
   */
  it("keeps a typed value through a visit to every other tab", async () => {
    renderWithProviders(<MemberProfilePage />);
    await waitFor(() => expect(nameField()).toBeInTheDocument());

    fireEvent.change(nameField(), { target: { value: "Still Here" } });

    for (const tab of screen.getAllByRole("tab")) {
      fireEvent.click(tab);
    }

    fireEvent.click(screen.getByRole("tab", { name: /Personal/ }));
    await waitFor(() => expect(nameField().value).toBe("Still Here"));
  });

  it("announces unsaved changes and offers to discard them", async () => {
    renderWithProviders(<MemberProfilePage />);
    await waitFor(() => expect(nameField()).toBeInTheDocument());

    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();

    fireEvent.change(nameField(), { target: { value: "Dirty" } });
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Discard changes/i }));
    await waitFor(() => expect(nameField().value).toBe(""));
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  it("disables Save until something changes", async () => {
    renderWithProviders(<MemberProfilePage />);
    await waitFor(() => expect(nameField()).toBeInTheDocument());

    const save = screen.getByRole("button", { name: /Save Profile/i });
    expect(save).toBeDisabled();

    fireEvent.change(nameField(), { target: { value: "Something" } });
    expect(save).toBeEnabled();
  });

  // The draft holds only what changed, so a save cannot overwrite a field nobody touched.
  it("sends only the changed fields, plus the version it was based on", async () => {
    renderWithProviders(<MemberProfilePage />);
    await waitFor(() => expect(nameField()).toBeInTheDocument());

    fireEvent.change(nameField(), { target: { value: "Only This" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Profile/i }));

    await waitFor(() => expect(saveBodies).toHaveLength(1));
    expect(saveBodies[0]).toEqual({
      name: "Only This",
      if_unmodified_since: "2026-10-30T10:00:00.000Z"
    });
  });

  it("confirms a successful save and clears the dirty state", async () => {
    renderWithProviders(<MemberProfilePage />);
    await waitFor(() => expect(nameField()).toBeInTheDocument());

    fireEvent.change(nameField(), { target: { value: "Saved Value" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Profile/i }));

    await waitFor(() => expect(screen.getByText(/has been saved/i)).toBeInTheDocument());
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  /**
   * A live member saved Tab 1 twice and then could not save Tab 3 at all.
   *
   * `clearDraft` resets the draft but not `baseUpdatedAt`, and the effect that seeds it only
   * runs while it is null — so every save after the first kept sending the FIRST read's
   * version. The server compared it against its own completed write, decided another session
   * had edited the profile, and answered 409. The member saw their Zone and Party selected on
   * screen and nothing reaching the database.
   *
   * Asserting on the SECOND save's `if_unmodified_since` is the whole test: the first was
   * always correct, which is why this survived.
   */
  it("re-bases the version stamp after each save, so consecutive saves are not rejected", async () => {
    renderWithProviders(<MemberProfilePage />);
    await waitFor(() => expect(nameField()).toBeInTheDocument());

    fireEvent.change(nameField(), { target: { value: "First" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Profile/i }));
    await waitFor(() => expect(saveBodies).toHaveLength(1));

    fireEvent.change(nameField(), { target: { value: "Second" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Profile/i }));
    await waitFor(() => expect(saveBodies).toHaveLength(2));

    expect(saveBodies[0]).toEqual({
      name: "First",
      if_unmodified_since: "2026-10-30T10:00:00.000Z"
    });
    // The version the FIRST save returned — not the one the page was originally read at.
    expect(saveBodies[1]).toEqual({
      name: "Second",
      if_unmodified_since: savedUpdatedAt(1)
    });
  });

  /** The same failure as above, reached the way the member actually reached it. */
  it("saves a Zone and Party chosen after an earlier save has already succeeded", async () => {
    renderWithProviders(<MemberProfilePage />);
    await waitFor(() => expect(nameField()).toBeInTheDocument());

    fireEvent.change(nameField(), { target: { value: "Tab One First" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Profile/i }));
    await waitFor(() => expect(saveBodies).toHaveLength(1));

    fireEvent.click(screen.getByRole("tab", { name: /Hizb/ }));
    await waitFor(() => expect(screen.getByLabelText("Zone")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Party"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Profile/i }));

    await waitFor(() => expect(saveBodies).toHaveLength(2));
    expect(saveBodies[1]).toEqual({
      zone_id: 1,
      party_id: 10,
      if_unmodified_since: savedUpdatedAt(1)
    });
  });

  // FR-094: a value awaiting review must not look authoritative.
  it("marks draft lookup values for review", async () => {
    renderWithProviders(<MemberProfilePage />);

    const select = await waitFor(
      () => screen.getByLabelText("Marital Status") as HTMLSelectElement
    );
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels.some((l) => l?.includes("DRAFT — NEEDS REVIEW"))).toBe(true);
  });

  // FR-048 — the dependent dropdown, and the clearing behaviour that keeps it honest.
  describe("Tab 3 dependent dropdown", () => {
    async function openHizb() {
      renderWithProviders(<MemberProfilePage />);
      await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(12));
      fireEvent.click(screen.getByRole("tab", { name: /Hizb/ }));
      await waitFor(() => expect(screen.getByLabelText("Zone")).toBeInTheDocument());
    }

    it("disables Party until a Zone is chosen", async () => {
      await openHizb();
      expect(screen.getByLabelText("Party")).toBeDisabled();
    });

    it("offers only the parties in the chosen Zone", async () => {
      await openHizb();

      fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "1" } });

      const party = screen.getByLabelText("Party") as HTMLSelectElement;
      const labels = Array.from(party.options).map((o) => o.textContent);
      expect(labels).toContain("Hizb In One");
      expect(labels).not.toContain("Hizb In Two");
    });

    /**
     * Changing the Zone must clear a Party that no longer belongs to it. Left behind, the
     * member would see a Party that is not in the list and the save would be refused by the
     * server's cross-zone check with nothing on screen to explain why.
     */
    it("clears a Party that does not belong to the newly chosen Zone", async () => {
      await openHizb();

      fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "1" } });
      fireEvent.change(screen.getByLabelText("Party"), { target: { value: "10" } });
      expect((screen.getByLabelText("Party") as HTMLSelectElement).value).toBe("10");

      fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "2" } });

      await waitFor(() =>
        expect((screen.getByLabelText("Party") as HTMLSelectElement).value).toBe("")
      );
    });

    /**
     * FR-048a — inactive Hizbs are offered, marked rather than hidden.
     *
     * Hiding them has a failure mode worth naming: a member whose own Hizb was deactivated
     * would find their saved value absent from the list. The select renders blank, the save
     * is refused, and nothing on screen says why — the same shape as the bug fixed on
     * 2026-11-04. It also leaves a member who genuinely belongs to a retired Hizb no way to
     * say so.
     */
    it("offers inactive Hizbs as well as active ones", async () => {
      renderWithProviders(<MemberProfilePage />);
      await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(12));
      fireEvent.click(screen.getByRole("tab", { name: /Hizb/ }));
      await waitFor(() => expect(screen.getByLabelText("Zone")).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "1" } });

      const party = screen.getByLabelText("Party") as HTMLSelectElement;
      const values = Array.from(party.options).map((o) => o.value);
      expect(values).toContain("11");
    });

    it("marks an inactive Hizb, so it does not read as an ordinary choice", async () => {
      renderWithProviders(<MemberProfilePage />);
      await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(12));
      fireEvent.click(screen.getByRole("tab", { name: /Hizb/ }));
      await waitFor(() => expect(screen.getByLabelText("Zone")).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "1" } });

      const party = screen.getByLabelText("Party") as HTMLSelectElement;
      const byValue = (v: string) =>
        Array.from(party.options).find((o) => o.value === v)?.textContent ?? "";

      expect(byValue("11")).toMatch(/INACTIVE/);
      // The active one must NOT be marked, or the mark means nothing.
      expect(byValue("10")).toBe("Hizb In One");
    });

    it("keeps the active Hizbs ahead of the retired ones", async () => {
      renderWithProviders(<MemberProfilePage />);
      await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(12));
      fireEvent.click(screen.getByRole("tab", { name: /Hizb/ }));
      await waitFor(() => expect(screen.getByLabelText("Zone")).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "1" } });

      const party = screen.getByLabelText("Party") as HTMLSelectElement;
      // [0] is the placeholder.
      const values = Array.from(party.options).map((o) => o.value).slice(1);
      expect(values).toEqual(["10", "11"]);
    });

    it("still keeps a Zone's Hizbs out of another Zone's list", async () => {
      renderWithProviders(<MemberProfilePage />);
      await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(12));
      fireEvent.click(screen.getByRole("tab", { name: /Hizb/ }));
      await waitFor(() => expect(screen.getByLabelText("Zone")).toBeInTheDocument());

      fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "2" } });

      const party = screen.getByLabelText("Party") as HTMLSelectElement;
      const values = Array.from(party.options).map((o) => o.value);
      expect(values).toContain("20");
      expect(values).not.toContain("11");
    });
  });
});
