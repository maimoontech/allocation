import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemberLookupEditPage } from "./MemberLookupEditPage";
import { renderWithProviders } from "../../test-utils";

/**
 * The admin lookup editor.
 *
 * The claim worth testing is the one that protects member data: **Delete is offered only for a
 * value nothing points at.** Five of the ten foreign keys behind these lists are
 * ON DELETE SET NULL, so for half of them the database would allow a delete and silently blank
 * that answer on every member who had chosen it. The server refuses, but the button must not be
 * there in the first place — an admin should be told what to do, not shown an action that will
 * fail.
 *
 * `useParams` is stubbed rather than wrapping a router, because the page takes exactly one
 * route parameter and a MemoryRouter would add a second thing that can break.
 */

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ entity: "places" }),
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    )
  };
});

const DETAIL = {
  entity: "places",
  label: "Places Visited",
  used_for: "Member profile, Tab 8 — Places Visited.",
  rows: [
    { id: 1, name: "Nairobi", display_order: 1, is_active: 1, is_draft: 0, in_use: 0 },
    { id: 2, name: "Colombo", display_order: 2, is_active: 1, is_draft: 0, in_use: 3 },
    { id: 3, name: "Dubai", display_order: 3, is_active: 0, is_draft: 1, in_use: 0 }
  ]
};

type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let nextResponse: (call: Call) => Response;

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

beforeEach(() => {
  calls = [];
  nextResponse = (call) => {
    if (call.method === "GET") return json(200, { success: true, data: DETAIL });
    return json(200, { success: true, data: { success: true } });
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const request = input instanceof Request ? input : null;
      const url = request ? request.url : String(input);
      const method = (request?.method ?? init?.method ?? "GET").toUpperCase();
      const raw = request ? await request.clone().text() : (init?.body ?? null);
      const call: Call = {
        url,
        method,
        body: typeof raw === "string" && raw ? JSON.parse(raw) : null
      };
      calls.push(call);
      return nextResponse(call);
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("deletion safety", () => {
  it("offers Delete for an unused value and withholds it for one in use", async () => {
    renderWithProviders(<MemberLookupEditPage />);
    await waitFor(() => expect(screen.getByText("Nairobi")).toBeInTheDocument());

    const rows = screen.getAllByRole("row");
    const nairobi = rows.find((r) => r.textContent?.includes("Nairobi"))!;
    const colombo = rows.find((r) => r.textContent?.includes("Colombo"))!;

    // Nothing points at Nairobi.
    expect(nairobi.querySelector("button[class*='text-danger']")).not.toBeNull();

    // Three member records point at Colombo, so there is no Delete at all.
    expect(colombo.querySelector("button[class*='text-danger']")).toBeNull();
    expect(colombo.textContent).toContain("In use");
    expect(colombo.textContent).toContain("3");
  });

  it("explains what to do instead of deleting a value in use", async () => {
    renderWithProviders(<MemberLookupEditPage />);
    await waitFor(() => expect(screen.getByText("Colombo")).toBeInTheDocument());

    const inUse = screen.getByTitle(/Used by 3 member records/);
    expect(inUse.getAttribute("title")).toMatch(/Inactive instead/i);
  });

  it("confirms before deleting, and does nothing if the admin cancels", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderWithProviders(<MemberLookupEditPage />);
    await waitFor(() => expect(screen.getByText("Nairobi")).toBeInTheDocument());

    const nairobi = screen.getAllByRole("row").find((r) => r.textContent?.includes("Nairobi"))!;
    fireEvent.click(nairobi.querySelector("button[class*='text-danger']") as HTMLElement);

    expect(confirm).toHaveBeenCalled();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("surfaces the server's refusal rather than a generic failure", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);

    // What the server sends when a value turns out to be in use after the page was loaded.
    nextResponse = (call) => {
      if (call.method === "GET") return json(200, { success: true, data: DETAIL });
      return json(409, {
        success: false,
        data: { in_use: 4 },
        message: "This value is used by 4 member records. Set it to Inactive instead."
      });
    };

    renderWithProviders(<MemberLookupEditPage />);
    await waitFor(() => expect(screen.getByText("Nairobi")).toBeInTheDocument());

    const nairobi = screen.getAllByRole("row").find((r) => r.textContent?.includes("Nairobi"))!;
    fireEvent.click(nairobi.querySelector("button[class*='text-danger']") as HTMLElement);

    await waitFor(() =>
      expect(screen.getByText(/used by 4 member records/i)).toBeInTheDocument()
    );
  });
});

describe("adding and editing", () => {
  it("sends a trimmed name and the chosen order", async () => {
    renderWithProviders(<MemberLookupEditPage />);
    await waitFor(() => expect(screen.getByLabelText(/^Name/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "  Karachi  " } });
    fireEvent.change(screen.getByLabelText(/^Display Order/), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: /Add value/i }));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));

    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toContain("/member-lookups/places");
    expect(post.body).toEqual({ name: "Karachi", display_order: 7, is_active: 1 });
  });

  it("refuses to submit a blank name without calling the server", async () => {
    renderWithProviders(<MemberLookupEditPage />);
    await waitFor(() => expect(screen.getByLabelText(/^Name/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /Add value/i }));

    expect(screen.getByText(/Enter a name/i)).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("loads a row into the form for editing and PATCHes it", async () => {
    renderWithProviders(<MemberLookupEditPage />);
    await waitFor(() => expect(screen.getByText("Nairobi")).toBeInTheDocument());

    const nairobi = screen.getAllByRole("row").find((r) => r.textContent?.includes("Nairobi"))!;
    fireEvent.click(within_(nairobi, "Edit"));

    await waitFor(() =>
      expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe("Nairobi")
    );

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Nairobi, Kenya" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));

    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toMatch(/\/member-lookups\/places\/1$/);
    expect(patch.body).toMatchObject({ name: "Nairobi, Kenya" });
  });
});

describe("the draft flag", () => {
  // The seeded starter values show members "DRAFT — NEEDS REVIEW". Clearing the flag is the
  // act of signing one off, so it has to be reachable in one click from the list.
  it("clears the draft flag with one click", async () => {
    renderWithProviders(<MemberLookupEditPage />);
    await waitFor(() => expect(screen.getByText("Dubai")).toBeInTheDocument());

    const dubai = screen.getAllByRole("row").find((r) => r.textContent?.includes("Dubai"))!;
    expect(dubai.textContent).toContain("DRAFT");

    fireEvent.click(within_(dubai, "Mark reviewed"));

    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toMatch(/\/member-lookups\/places\/3$/);
    expect(patch.body).toEqual({ is_draft: 0 });
  });

  it("shows the review count and the list's purpose", async () => {
    renderWithProviders(<MemberLookupEditPage />);
    await waitFor(() => expect(screen.getByText(/1 awaiting review/)).toBeInTheDocument());
    expect(screen.getByText(/Tab 8 — Places Visited/)).toBeInTheDocument();
  });
});

/** Finds a button by its text inside one table row. */
function within_(row: HTMLElement, label: string): HTMLElement {
  const match = Array.from(row.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label
  );
  if (!match) throw new Error(`No "${label}" button in that row`);
  return match;
}
