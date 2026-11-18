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

export type MemberDashboard = {
  access: MemberAccessStats;
  form: MemberFormStats;
  generated_at: string;
};

export const memberDashboardApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getMemberDashboard: builder.query<MemberDashboard, void>({
      query: () => "/member-dashboard",
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
