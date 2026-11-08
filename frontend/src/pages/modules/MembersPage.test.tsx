import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MembersPage } from "./MembersPage";
import { setAuth } from "../../features/auth/authSlice";
import { makeTestStore, renderWithProviders } from "../../test-utils";
import type { Role } from "../../types";

/**
 * The member list, shared by the administrator and the Zonal Head.
 *
 * It must show the identifying details the office works from — photograph, name parts, zone
 * and party posting, and both contact numbers — while health and other profile answers stay
 * off the screen. A missing photograph degrades to initials rather than a broken image, and
 * an unposted member shows a dash rather than an empty cell.
 *
 * It must also create an account from three fields, and — for a Zonal Head — say plainly
 * that the account it just created is not in their zone-scoped list yet.
 */

/** A store already signed in as `role`, since the page's wording depends on it. */
function storeAs(role: Role, zoneId?: number) {
  const store = makeTestStore();
  store.dispatch(
    setAuth({
      token: "test-token",
      refreshToken: "test-refresh",
      user: { role, id: 1, displayName: "__TEST__", zoneId }
    })
  );
  return store;
}

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
/** Bodies of every POST /members, so a test can assert what was actually sent. */
let posted: any[] = [];
/** Set by a test to make the next create fail with this status and message. */
let createFailure: { status: number; message: string } | null = null;
/** Set by a test to make the next password reset fail. */
let resetFailure: { status: number; message: string } | null = null;

beforeEach(() => {
  requested = [];
  posted = [];
  createFailure = null;
  resetFailure = null;

  Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:member-photo"),
    revokeObjectURL: vi.fn()
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      requested.push(url);

      if (url.includes("/members/11/photo")) {
        return new Response(new Blob(["png"], { type: "image/png" }), {
          status: 200,
          headers: { "Content-Type": "image/png" }
        });
      }

      if (method === "POST" && url.includes("/reset-password")) {
        const raw = input instanceof Request ? await input.clone().text() : String(init?.body ?? "{}");
        posted.push({ resetUrl: url, ...JSON.parse(raw || "{}") });

        if (resetFailure) {
          return new Response(
            JSON.stringify({ success: false, data: null, message: resetFailure.message }),
            { status: resetFailure.status, headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: 11,
              its_no: "40480241",
              member_name: "Husain",
              must_change_password: true
            },
            message: "Password reset."
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (method === "POST" && url.includes("/members")) {
        const raw = input instanceof Request ? await input.clone().text() : String(init?.body ?? "{}");
        const body = JSON.parse(raw || "{}");
        posted.push(body);

        if (createFailure) {
          return new Response(
            JSON.stringify({ success: false, data: null, message: createFailure.message }),
            { status: createFailure.status, headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: 99,
              its_no: body.its_no,
              member_name: body.member_name,
              is_active: true,
              must_change_password: true
            },
            message: "created"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
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

describe("MembersPage — adding a member", () => {
  async function openForm(role: Role) {
    renderWithProviders(<MembersPage />, { store: storeAs(role, 7) });
    fireEvent.click(await screen.findByRole("button", { name: "Add member" }));
  }

  function fillForm(values: { its_no: string; member_name: string; password: string }) {
    fireEvent.change(screen.getByLabelText(/^ITS No/), { target: { value: values.its_no } });
    fireEvent.change(screen.getByLabelText(/^Full Name/), {
      target: { value: values.member_name }
    });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: values.password } });
  }

  const VALID = {
    its_no: "40480999",
    member_name: "Mulla Taha Ali Rangwala",
    password: "Tanzeem#2026"
  };

  it("sends only the ITS number, full name and password", async () => {
    await openForm("admin");
    fillForm(VALID);
    fireEvent.click(screen.getByRole("button", { name: "Create member" }));

    await waitFor(() => expect(posted).toHaveLength(1));
    // Exactly three fields. Zone, party and profile answers are the member's own to fill,
    // so the form must not smuggle any of them in.
    expect(posted[0]).toEqual(VALID);
  });

  it("trims what was typed, so a stray space cannot become part of the ITS number", async () => {
    await openForm("admin");
    fillForm({ ...VALID, its_no: "  40480999  ", member_name: "  Taha  " });
    fireEvent.click(screen.getByRole("button", { name: "Create member" }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].its_no).toBe("40480999");
    expect(posted[0].member_name).toBe("Taha");
    // The password is NOT trimmed: trimming would accept one the member could never retype.
    expect(posted[0].password).toBe("Tanzeem#2026");
  });

  it("confirms the account afterwards, naming the forced password change", async () => {
    await openForm("admin");
    fillForm(VALID);
    fireEvent.click(screen.getByRole("button", { name: "Create member" }));

    expect(await screen.findByText(/Created 1 member just now/)).toBeInTheDocument();
    expect(screen.getByText(/must change password at first sign-in/)).toBeInTheDocument();
  });

  it("rejects a malformed ITS number without calling the server", async () => {
    await openForm("admin");
    fillForm({ ...VALID, its_no: "12ab" });
    fireEvent.click(screen.getByRole("button", { name: "Create member" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ITS No must be 6 to 20 digits.");
    expect(posted).toHaveLength(0);
  });

  it("shows the server's own message when it refuses, rather than a generic failure", async () => {
    await openForm("admin");
    createFailure = { status: 409, message: "ITS No 40480999 already has a member account." };

    fillForm(VALID);
    fireEvent.click(screen.getByRole("button", { name: "Create member" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ITS No 40480999 already has a member account."
    );
  });

  it("lets the operator read the password back, since a typo cannot be reset here", async () => {
    await openForm("admin");

    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("type", "text");
  });

  it("warns a Zonal Head that the new member is not in their list yet", async () => {
    await openForm("zonal_head");

    expect(
      screen.getByText(/A new account has no zone until the member chooses one/i)
    ).toBeInTheDocument();
  });

  it("does not show that warning to an administrator, who sees every account", async () => {
    await openForm("admin");

    expect(
      screen.queryByText(/A new account has no zone until the member chooses one/i)
    ).not.toBeInTheDocument();
  });
});

/**
 * FR-005a — an administrator resets a member's password.
 *
 * The control is admin-only, which is the first test: the server refuses a Zonal Head, and
 * a button that gets refused is worse than no button.
 *
 * The warning is not decoration either. A reset signs the member out everywhere and clears
 * their lockout, and an administrator who does not know that will not understand why the
 * member they were helping was suddenly logged out mid-call.
 */
describe("MembersPage — resetting a password", () => {
  /**
   * The row control and the panel's submit button share a name, deliberately — both say
   * what they do. They are told apart by type, which is what a person does visually.
   */
  const submitReset = () =>
    screen
      .getAllByRole("button", { name: /^Reset password$/ })
      .find((b) => (b as HTMLButtonElement).type === "submit") as HTMLButtonElement;

  async function openReset(role: Role = "admin") {
    renderWithProviders(<MembersPage />, { store: storeAs(role, 7) });
    await waitFor(() => expect(screen.getByText("40480241")).toBeInTheDocument());
    const buttons = screen.getAllByRole("button", { name: "Reset password" });
    fireEvent.click(buttons[0]);
    return screen.getByLabelText(/^New Password/) as HTMLInputElement;
  }

  it("offers the reset to an administrator", async () => {
    renderWithProviders(<MembersPage />, { store: storeAs("admin", 7) });
    await waitFor(() => expect(screen.getByText("40480241")).toBeInTheDocument());

    expect(screen.getAllByRole("button", { name: "Reset password" }).length).toBeGreaterThan(0);
  });

  it("does not offer it to a Zonal Head", async () => {
    renderWithProviders(<MembersPage />, { store: storeAs("zonal_head", 7) });
    await waitFor(() => expect(screen.getByText("40480241")).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: "Reset password" })).not.toBeInTheDocument();
  });

  it("names the member being reset, so the wrong row cannot be picked silently", async () => {
    await openReset();

    expect(screen.getByText(/Reset password for .*40480241/)).toBeInTheDocument();
  });

  it("warns that the member will be signed out", async () => {
    await openReset();

    expect(screen.getByText(/signs the member out everywhere/i)).toBeInTheDocument();
  });

  it("posts the new password to that member's reset endpoint", async () => {
    const field = await openReset();

    fireEvent.change(field, { target: { value: "Tanzeem#2026" } });
    fireEvent.click(submitReset());

    await waitFor(() => expect(posted.some((p) => p.resetUrl)).toBe(true));
    const sent = posted.find((p) => p.resetUrl);
    expect(sent.resetUrl).toContain("/members/11/reset-password");
    expect(sent.password).toBe("Tanzeem#2026");
  });

  it("confirms afterwards, and says the member must change it", async () => {
    const field = await openReset();

    fireEvent.change(field, { target: { value: "Tanzeem#2026" } });
    fireEvent.click(submitReset());

    await waitFor(() =>
      expect(screen.getByText(/must\s+change it at their next sign-in/i)).toBeInTheDocument()
    );
  });

  /** The server names the rule that failed; a generic message would throw that away. */
  it("shows the server's reason verbatim when the reset is refused", async () => {
    resetFailure = { status: 400, message: "Password must be at least 8 characters." };
    const field = await openReset();

    fireEvent.change(field, { target: { value: "short" } });
    fireEvent.click(submitReset());

    await waitFor(() =>
      expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument()
    );
  });

  it("can be abandoned without sending anything", async () => {
    await openReset();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText(/^New Password/)).not.toBeInTheDocument();
    expect(posted.some((p) => p.resetUrl)).toBe(false);
  });
});
