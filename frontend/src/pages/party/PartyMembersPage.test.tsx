import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { PartyMembersPage } from "./PartyMembersPage";
import { renderWithProviders } from "../../test-utils";

/**
 * A party sees its own people — and only its own name, ITS number and photograph.
 *
 * The server owns the scoping (the party id comes from the token), so what is worth testing
 * here is presentation: name parts compose in the right order, the "None" placeholder is not
 * printed as a name, and a missing photograph degrades to initials instead of a broken image.
 */

const MEMBERS = [
  {
    id: 11,
    its_no: "30303030",
    first_prefix: "Mulla",
    name: "Husain",
    father_prefix: "Sheikh",
    father_name: "Ali",
    surname: "Kaukawala",
    has_photo: true,
    // FR-112c. Supplied by the server, computed from presence rather than from any answer.
    profile_updated_at: "2026-11-24T08:30:00.000Z",
    completion_percent: 76,
    completion_answered: 32,
    completion_asked: 42
  },
  {
    id: 12,
    its_no: "30303031",
    first_prefix: "None",
    name: "Fatema",
    father_prefix: "None",
    father_name: "None",
    surname: "Bai",
    has_photo: false,
    // Saved once, long ago: the case the column exists to make visible.
    profile_updated_at: "2026-02-10T08:30:00.000Z",
    completion_percent: 19,
    completion_answered: 8,
    completion_asked: 42
  }
];

const PAGE = { items: MEMBERS, total: 2, page: 1, page_size: 25 };

let requested: string[] = [];

beforeEach(() => {
  requested = [];

  Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:party-member-photo"),
    revokeObjectURL: vi.fn()
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      requested.push(url);

      if (url.includes("/party-members/11/photo")) {
        return new Response(new Blob(["png"], { type: "image/png" }), {
          status: 200,
          headers: { "Content-Type": "image/png" }
        });
      }

      if (url.includes("/party-members")) {
        return new Response(JSON.stringify({ success: true, data: PAGE }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ message: "unexpected" }), { status: 404 });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PartyMembersPage", () => {
  it("lists ITS numbers and composed names", async () => {
    renderWithProviders(<PartyMembersPage />);

    expect(await screen.findByText("30303030")).toBeInTheDocument();
    expect(screen.getByText("Mulla Husain Sheikh Ali Kaukawala")).toBeInTheDocument();

    // "None" is a stored placeholder, not part of the name.
    expect(screen.getByText("Fatema Bai")).toBeInTheDocument();
    expect(screen.queryByText(/None Fatema/)).not.toBeInTheDocument();
  });

  it("fetches a photograph only for members that have one", async () => {
    renderWithProviders(<PartyMembersPage />);

    const photo = await screen.findByAltText("Mulla Husain Sheikh Ali Kaukawala photograph");
    expect(photo).toHaveAttribute("src", "blob:party-member-photo");

    await waitFor(() => {
      expect(requested.some((url) => url.includes("/party-members/11/photo"))).toBe(true);
    });
    expect(requested.some((url) => url.includes("/party-members/12/photo"))).toBe(false);
  });

  it("falls back to initials when there is no photograph", async () => {
    renderWithProviders(<PartyMembersPage />);

    expect(await screen.findByText("FB")).toBeInTheDocument();
  });

  it("sends the search term to the party-scoped endpoint", async () => {
    renderWithProviders(<PartyMembersPage />);
    await screen.findByText("30303030");

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "Fatema" } });

    await waitFor(() => {
      expect(
        requested.some((url) => url.includes("/party-members?") && url.includes("q=Fatema"))
      ).toBe(true);
    });
  });
});

/**
 * Profile completion and when the member last saved (FR-112c).
 *
 * The party is who does the chasing, so these two columns are the reason a party leader opens
 * this page at all. Both come from the SERVER - the percentage computed there by the same code
 * the administrator list and the dashboard use - so what is worth testing here is that the row
 * shows them faithfully and that the page says what they mean.
 */
describe("profile completion and last saved (FR-112c)", () => {
  it("shows each member own percentage", async () => {
    renderWithProviders(<PartyMembersPage />);

    expect(await screen.findByText("76%")).toBeInTheDocument();
    expect(screen.getByText("19%")).toBeInTheDocument();
  });

  it("spells out the fraction, because the denominator is per member", async () => {
    renderWithProviders(<PartyMembersPage />);

    expect(await screen.findByText("32 of 42")).toBeInTheDocument();
    expect(screen.getByText("8 of 42")).toBeInTheDocument();
  });

  it("says how long ago the profile was saved, and on what date", async () => {
    renderWithProviders(<PartyMembersPage />);

    // The exact date is what gets quoted back in a conversation; the relative line is what
    // answers "who has gone quiet".
    expect(await screen.findByText("24/Nov/26")).toBeInTheDocument();
    expect(screen.getByText("10/Feb/26")).toBeInTheDocument();
  });

  /**
   * FR-112 requires the definition beside the figure. It matters more here than anywhere: a
   * party leader reading "19%" will act on it, and the denominator is not fixed.
   */
  it("states what the two columns mean, and what they do not show", async () => {
    renderWithProviders(<PartyMembersPage />);

    const note = await screen.findByText(/only the questions that member was asked/i);
    expect(note.textContent).toMatch(/Student/);
    // The date moves on an administrator correction too, so it is not attributed.
    expect(note.textContent).toMatch(/by the member or by an administrator correcting it/i);
    expect(note.textContent).toMatch(/stays private to them/i);
  });

  it("still shows nothing from the profile itself", async () => {
    renderWithProviders(<PartyMembersPage />);
    await screen.findByText("76%");

    // The roster columns plus the two derived figures. No answer, no contact detail, no
    // account state.
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Photo", "ITS No", "Name", "Profile", "Last saved"]);
  });
});
