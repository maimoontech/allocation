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
    has_photo: true
  },
  {
    id: 12,
    its_no: "30303031",
    first_prefix: "None",
    name: "Fatema",
    father_prefix: "None",
    father_name: "None",
    surname: "Bai",
    has_photo: false
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
