import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemberProfileViewPage } from "./MemberProfileViewPage";
import { renderWithProviders } from "../../test-utils";

/**
 * An administrator or Zonal Head reading one member's twelve-tab profile (FR-047a).
 *
 * The claim worth testing hardest is that EDITING is the server's decision, not the
 * browser's. The page reads `can_edit` out of the payload; it never looks at the signed-in
 * role. So these tests change only that one flag and assert the page follows it — which is
 * also how they prove a Zonal Head is not merely hidden from the Save button by a role check
 * that a different page might forget to apply.
 */

const PROFILE = {
  its_no: "99900101",
  has_photo: false,
  updated_at: "2026-11-06T10:00:00.000Z",
  first_prefix: "None",
  name: "Test",
  father_prefix: "None",
  father_name: null,
  surname: "Member",
  dob_gregorian: null,
  dob_hijri_day: null,
  dob_hijri_month: null,
  dob_hijri_year: null,
  dob_hijri_text: null,
  nationality: null,
  marital_status_id: null,
  residence_address: null,
  mohallah_id: null,
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
  zikr_e_hussain_since_year: null,
  registered_with_idaratuz_zakereen: null,
  five_kalam_uploaded_when: null,
  blood_group: "AB-",
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
  marital_statuses: [],
  skills: [],
  tamreen_frequencies: [],
  tamreen_methods: [],
  zones: [],
  parties: [],
  mohallahs: [],
  venues: [],
  current_hijri_year: 1448
};

function envelope(data: unknown, status = 200, message = "OK"): Response {
  return new Response(JSON.stringify({ success: status < 400, data, message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

let saveBodies: unknown[] = [];
let canEdit = true;
let profileStatus = 200;
let lookupsStatus = 200;

function stub() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const isRequest = typeof Request !== "undefined" && input instanceof Request;
      const url = isRequest ? input.url : String(input);
      const method = (isRequest ? input.method : init?.method) ?? "GET";

      if (url.includes("/members/lookups")) {
        if (lookupsStatus !== 200) return envelope(null, lookupsStatus, "Forbidden");
        return envelope(LOOKUPS);
      }

      if (url.includes("/members/7/profile")) {
        if (method.toUpperCase() === "PUT") {
          const raw = isRequest ? await input.clone().text() : String(init?.body ?? "{}");
          saveBodies.push(JSON.parse(raw));
          return envelope({ ...PROFILE, can_edit: true });
        }
        if (profileStatus !== 200) return envelope(null, profileStatus, "Forbidden");
        return envelope({ ...PROFILE, can_edit: canEdit });
      }

      return envelope({});
    })
  );
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/members/:id/profile" element={<MemberProfileViewPage />} />
    </Routes>,
    { route: "/members/7/profile" }
  );
}

beforeEach(() => {
  saveBodies = [];
  canEdit = true;
  profileStatus = 200;
  lookupsStatus = 200;
  stub();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MemberProfileViewPage", () => {
  it("shows the member's name and all twelve tabs", async () => {
    renderPage();

    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(12));
    expect(screen.getByText("Test Member")).toBeInTheDocument();
    expect(screen.getByText(/99900101/)).toBeInTheDocument();
  });

  /**
   * The authorised widening of FR-065: health values reach both roles, not just the member.
   */
  it("shows the health tab, including the blood group", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(12));

    fireEvent.click(screen.getByRole("tab", { name: /Health/ }));

    const blood = await waitFor(
      () => screen.getByLabelText(/^Blood Group/) as HTMLSelectElement
    );
    expect(blood.value).toBe("AB-");
  });

  it("offers Save to a caller the server says may edit", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(12));

    expect(screen.getByRole("button", { name: /Save Changes/i })).toBeInTheDocument();
    expect(screen.getByText(/recorded against your account/i)).toBeInTheDocument();
  });

  it("offers no Save at all when the server says the caller may not edit", async () => {
    canEdit = false;
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(12));

    expect(screen.queryByRole("button", { name: /Save Changes/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Only an administrator can change/i)).toBeInTheDocument();
  });

  it("renders every field disabled when the caller may not edit", async () => {
    canEdit = false;
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(12));

    expect(screen.getByLabelText(/^Name/)).toBeDisabled();
  });

  it("sends only the changed fields, with the version it was based on", async () => {
    renderPage();
    const field = await waitFor(() => screen.getByLabelText(/^Name/) as HTMLInputElement);

    fireEvent.change(field, { target: { value: "Corrected" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() => expect(saveBodies).toHaveLength(1));
    expect(saveBodies[0]).toEqual({
      name: "Corrected",
      if_unmodified_since: "2026-11-06T10:00:00.000Z"
    });
  });

  it("keeps Save disabled until something changes", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(12));

    expect(screen.getByRole("button", { name: /Save Changes/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Edited" } });
    expect(screen.getByRole("button", { name: /Save Changes/i })).toBeEnabled();
  });

  /**
   * The lookups are a SEPARATE request. When only they failed the page used to blame the
   * profile, which is the one thing that had worked — and that is exactly how the
   * member-only guard on `/members/lookups` stayed hidden until an administrator clicked
   * View profile in production.
   */
  it("says so when the dropdown lists are what failed, not the profile", async () => {
    lookupsStatus = 403;
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/Could not load the dropdown lists/i)).toBeInTheDocument()
    );
  });

  /**
   * A 403 is not an outage. A Zonal Head who opens a member outside their zone has reached a
   * rule, and "please reload" would send them round a loop that cannot succeed.
   */
  it("explains a 403 as a zone boundary rather than an error", async () => {
    profileStatus = 403;
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/not in your zone/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/reload the page/i)).not.toBeInTheDocument();
  });
});
