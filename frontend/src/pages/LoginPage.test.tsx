import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { LoginPage } from "./LoginPage";
import { renderWithProviders } from "../test-utils";

/**
 * REGRESSION BASELINE — LOGIN PAGE (FR-102, FR-103)
 *
 * Written against the unmodified page, before "Member" is added to the role dropdown.
 *
 * The membership module's frontend change is small but touches shared code: one entry in
 * `roleOptions`, one branch in `defaultPathByRole`, and the `Role` union that
 * `AppShell`'s `navByRole` is keyed on. These tests pin what the four existing roles do
 * now — the option list, their order, and the per-role identifier labelling that tells a
 * party to enter an ITS number — so a careless edit to that array is caught here rather
 * than by a user who cannot sign in.
 *
 * No network call is made: nothing is submitted, so the page is exercised as a form only.
 *
 * A note on the queries below. `Input` renders its `helperText` INSIDE the wrapping
 * `<label>`, so a field's accessible name becomes the label plus the hint — for example
 * "ID / NameUse your Admin username". The identifier field is therefore matched with a
 * start-anchored regex rather than an exact string. That is a pre-existing accessibility
 * wrinkle in `components/ui/Input.tsx`, not something this feature introduced, and it is
 * left alone here: changing shared UI is outside the scope of a regression baseline.
 */

/** Matches the identifier field despite its helper text being part of the accessible name. */
const IDENTIFIER_ID_NAME = /^ID \/ Name/;
const IDENTIFIER_ITS_NO = /^ITS No/;

describe("REGRESSION: login page role options", () => {
  // Updated at T053, when Member was added. The four existing entries are still asserted
  // exactly — same values, same labels, same order, same positions — so the edit that added
  // Member is proven to have APPENDED rather than reordered or renamed anything.
  it("offers the four existing roles unchanged, with Member appended", () => {
    renderWithProviders(<LoginPage />);

    const select = screen.getByLabelText("Role") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    const labels = Array.from(select.options).map((o) => o.textContent);

    expect(values).toEqual(["admin", "zonal_head", "party", "coordinator", "member"]);
    expect(labels).toEqual([
      "Admin",
      "Zonal Head",
      "Party",
      "Venue Coordinator",
      "Member"
    ]);

    // The existing four must keep their original positions, not merely be present.
    expect(values.slice(0, 4)).toEqual(["admin", "zonal_head", "party", "coordinator"]);
  });

  it("defaults to the admin role", () => {
    renderWithProviders(<LoginPage />);
    expect((screen.getByLabelText("Role") as HTMLSelectElement).value).toBe("admin");
  });

  it("renders an identifier field, a password field and a submit button", () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByLabelText(IDENTIFIER_ID_NAME)).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Login" })).toBeInTheDocument();
  });

  it("uses a password input for the password, not a text input", () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  // The party case is the one that matters most: party login is by ITS number only, and the
  // label is the only thing telling the user that.
  it("labels the identifier field 'ITS No' for the party role", () => {
    renderWithProviders(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "party" } });

    expect(screen.getByLabelText(IDENTIFIER_ITS_NO)).toBeInTheDocument();
    expect(screen.queryByLabelText(IDENTIFIER_ID_NAME)).not.toBeInTheDocument();
    expect(screen.getByText("Use your ITS No as User ID")).toBeInTheDocument();
  });

  it.each([
    ["admin", IDENTIFIER_ID_NAME, "Use your Admin username"],
    ["zonal_head", IDENTIFIER_ID_NAME, "Use your Zone name or Zone ID"],
    ["party", IDENTIFIER_ITS_NO, "Use your ITS No as User ID"],
    ["coordinator", IDENTIFIER_ID_NAME, "Use your Venue name or Venue ID"],
    ["member", IDENTIFIER_ITS_NO, "Use your ITS No"]
  ])("shows the right identifier label and hint for %s", (role, labelPattern, hint) => {
    renderWithProviders(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Role"), { target: { value: role } });

    expect(screen.getByLabelText(labelPattern)).toBeInTheDocument();
    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  it("keeps the typed identifier when the role changes", () => {
    renderWithProviders(<LoginPage />);

    const identifier = screen.getByLabelText(IDENTIFIER_ID_NAME);
    fireEvent.change(identifier, { target: { value: "30100001" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "party" } });

    expect((screen.getByLabelText(IDENTIFIER_ITS_NO) as HTMLInputElement).value).toBe("30100001");
  });

  it("shows the organisation branding and the forgot-password guidance", () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByText("Anjuman-e-Zakereen Hussain A.S Karachi")).toBeInTheDocument();
    // The "Zakereen Scheduling System" subtitle was commented out in LoginPage.tsx. The
    // assertion followed it rather than being left red: the heading above is the branding
    // the page actually shows.
    // There is no self-service reset; members will follow the same route.
    expect(
      screen.getByText("Forgot password? Contact Admin / Zonal Head.")
    ).toBeInTheDocument();
  });

  // This assertion previously read `not.toContain("member")`, as a sentinel for T053. It
  // failed the moment the option was added, which is exactly what it was for, and was then
  // updated deliberately rather than the change being noticed later.
  it("offers Member, labelled for a person rather than a group", () => {
    renderWithProviders(<LoginPage />);

    const select = screen.getByLabelText("Role") as HTMLSelectElement;
    const options = Array.from(select.options);
    const member = options.find((o) => o.value === "member");

    expect(member).toBeDefined();
    expect(member?.textContent).toBe("Member");
  });

  it("asks a member for an ITS No, as it does a party", () => {
    renderWithProviders(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "member" } });

    expect(screen.getByLabelText(IDENTIFIER_ITS_NO)).toBeInTheDocument();
    expect(screen.queryByLabelText(IDENTIFIER_ID_NAME)).not.toBeInTheDocument();
    expect(screen.getByText("Use your ITS No")).toBeInTheDocument();
  });

  // The hint differs from the party one on purpose: a party signs in as a group with its
  // leader's ITS number, a member signs in as themselves.
  it("gives the member a different hint from the party", () => {
    renderWithProviders(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "party" } });
    expect(screen.getByText("Use your ITS No as User ID")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "member" } });
    expect(screen.getByText("Use your ITS No")).toBeInTheDocument();
    expect(screen.queryByText("Use your ITS No as User ID")).not.toBeInTheDocument();
  });
});
