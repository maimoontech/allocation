import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { MembersPage } from "./MembersPage";
import { renderWithProviders } from "../../test-utils";

/**
 * The administrator's member list.
 *
 * It must show the identifying details the office works from — photograph, name parts, zone
 * and party posting, and both contact numbers — while health and other profile answers stay
 * off the screen. A missing photograph degrades to initials rather than a broken image, and
 * an unposted member shows a dash rather than an empty cell.
 */

const ITEMS = [
  {
    id: 11,
    its_no: "40480241",
    member_name: "Husain",
    must_change_password: false,
    is_active: true,
    has_profile: true,
    has_photo: true,
    first_prefix: "Mulla",
    name: "Husain",
    father_prefix: "Sheikh",
    father_name: "Ali",
    surname: "Kaukawala",
    zone_name: "Zone 1",
    party_name: "Burhani Party",
    whatsapp_no_1: "+92 300 1234567",
    whatsapp_no_2: null,
    mobile_no_1: null,
    mobile_no_2: "0300 7654321",
    last_login_at: "2026-11-01T10:15:00.000Z",
    created_at: "2026-10-30T13:00:53.000Z"
  },
  {
    id: 12,
    its_no: "40480242",
    member_name: "Fatema",
    must_change_password: true,
    is_active: false,
    has_profile: true,
    has_photo: false,
    first_prefix: "None",
    name: "Fatema",
    father_prefix: "None",
    father_name: null,
    surname: null,
    zone_name: null,
    party_name: null,
    whatsapp_no_1: null,
    whatsapp_no_2: null,
    mobile_no_1: null,
    mobile_no_2: null,
    last_login_at: null,
    created_at: "2026-10-30T13:00:53.000Z"
  }
];

let requested: string[] = [];

beforeEach(() => {
  requested = [];

  Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:member-photo"),
    revokeObjectURL: vi.fn()
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      requested.push(url);

      if (url.includes("/members/11/photo")) {
        return new Response(new Blob(["png"], { type: "image/png" }), {
          status: 200,
          headers: { "Content-Type": "image/png" }
        });
      }

      if (url.includes("/members")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { items: ITEMS, total: ITEMS.length, page: 1, page_size: 25 }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ message: "unexpected" }), { status: 404 });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MembersPage", () => {
  it("shows picture, ITS number, full name, zone, party and contact columns", async () => {
    renderWithProviders(<MembersPage />);

    expect(await screen.findByText("40480241")).toBeInTheDocument();
    expect(screen.getByText("Mulla Husain Ali Kaukawala")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Picture" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Zone" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Party" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "WhatsApp No." })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Mobile No." })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Last Sign-In" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Status" })).not.toBeInTheDocument();
    expect(screen.getByText("Zone 1")).toBeInTheDocument();
    expect(screen.getByText("Burhani Party")).toBeInTheDocument();

    // Primary number where present, second number as the fallback.
    expect(screen.getByText("+92 300 1234567")).toBeInTheDocument();
    expect(screen.getByText("0300 7654321")).toBeInTheDocument();
    // Status is no longer a column; the action button's label carries the account state.
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activate" })).toBeInTheDocument();
  });

  it("loads a photograph only for members that have one", async () => {
    renderWithProviders(<MembersPage />);

    const photo = await screen.findByAltText("Mulla Husain Ali Kaukawala photograph");
    expect(photo).toHaveAttribute("src", "blob:member-photo");
    expect(screen.getByText("F")).toBeInTheDocument();
    expect(requested.some((url) => url.includes("/members/11/photo"))).toBe(true);
    expect(requested.some((url) => url.includes("/members/12/photo"))).toBe(false);
  });
});
