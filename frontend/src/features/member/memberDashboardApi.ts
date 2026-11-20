import { api } from "../api/api";

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

/**
 * Counts for the administrator's member dashboard (FR-112).
 *
 * Counts and percentages only. No member is named and no profile value is carried, which is
 * what lets this sit on a landing page rather than behind a deliberate per-member request
 * (FR-101).
 */

export type MemberAccessStats = {
  total: number;
  active: number;
  inactive: number;
  /** Signed in at least once. */
  signed_in: number;
  never_signed_in: number;
  /** Replaced the password they were issued with one of their own. */
  changed_password: number;
  /** Got in, but is still on the password they were issued. */
  signed_in_not_changed: number;
  signed_in_percent: number;
  changed_password_percent: number;
};

export type MemberFormTabStats = {
  tab: number;
  label: string;
  asked: number;
  answered: number;
  percent: number;
};

export type MemberFormStats = {
  /** Active accounts. A withdrawn member's profile is kept but not measured. */
  measured: number;
  /** The average of each member's own percentage, so every member counts once. */
  average_percent: number;
  fully_answered: number;
  partly_answered: number;
  not_started: number;
  fully_answered_percent: number;
  questions_asked: number;
  questions_answered: number;
  tabs: MemberFormTabStats[];
};

/**
 * Which members to count.
 *
 * `"none"` is a filter in its own right, not an absent one: it selects the members who have
 * NOT answered that question. Those are the two populations a plain zone filter hides — the
 * account with no profile at all, and the member who stopped before Tab 3 — and they are the
 * two most worth finding.
 *
 * Zone and Mohallah are independent. Zone is the member's Hizb (Tab 3); Mohallah is where
 * they live (Tab 1). A member can do Zikr in one zone and live in a Mohallah belonging to
 * another, so neither list constrains the other.
 */
export type MemberDashboardFilter = {
  zone_id?: number | "none";
  mohallah_id?: number | "none";
};

export type MemberDashboard = {
  access: MemberAccessStats;
  form: MemberFormStats;
  /** Echoed by the server, so the page states what it counted rather than assuming. */
  filter: { zone_id: number | "none" | null; mohallah_id: number | "none" | null };
  generated_at: string;
};

export const memberDashboardApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getMemberDashboard: builder.query<MemberDashboard, MemberDashboardFilter | void>({
      query: (arg) => {
        const params = new URLSearchParams();
        if (arg?.zone_id !== undefined) params.set("zone_id", String(arg.zone_id));
        if (arg?.mohallah_id !== undefined) params.set("mohallah_id", String(arg.mohallah_id));
        const qs = params.toString();
        return qs ? `/member-dashboard?${qs}` : "/member-dashboard";
      },
      transformResponse: (res: ApiEnvelope<MemberDashboard>) => res.data,
      // Tagged with the member list: creating an account, resetting a password or
      // deactivating someone all change these totals, and all three already invalidate
      // Members. Without this the dashboard would keep showing figures from before the
      // change that was just made on another page.
      providesTags: [{ type: "Members", id: "LIST" }]
    })
  })
});

export const { useGetMemberDashboardQuery } = memberDashboardApi;
