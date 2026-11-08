import { api } from "../api/api";
import type { MemberProfile, MemberProfileInput } from "./memberApi";

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

/**
 * The identifying details the administrator's member list shows. The twelve-tab answers are
 * NOT here — a list of fifty members should not be a list of fifty medical records (FR-101).
 * They are fetched one member at a time by `getAdminMemberProfile` instead. No password
 * material is ever returned (FR-015). Photo bytes are fetched separately, per member.
 */
export type MemberAccount = {
  id: number;
  its_no: string;
  member_name: string | null;
  must_change_password: boolean;
  is_active: boolean;
  has_profile: boolean;
  has_photo: boolean;
  first_prefix: string | null;
  name: string | null;
  father_prefix: string | null;
  father_name: string | null;
  surname: string | null;
  zone_name: string | null;
  party_name: string | null;
  whatsapp_no_1: string | null;
  whatsapp_no_2: string | null;
  mobile_no_1: string | null;
  mobile_no_2: string | null;
  last_login_at: string | null;
  created_at: string;
};

export type MemberAccountPage = {
  items: MemberAccount[];
  total: number;
  page: number;
  page_size: number;
};

/** The three fields an Admin or Zonal Head supplies to create an account. */
export type CreateMemberRequest = {
  its_no: string;
  member_name: string;
  password: string;
};

/** What comes back after a create. No password material, by design (FR-015). */
export type CreatedMemberAccount = {
  id: number;
  its_no: string;
  member_name: string;
  is_active: boolean;
  must_change_password: boolean;
};

/**
 * One member's full twelve-tab profile, as an administrator or Zonal Head sees it (FR-047a).
 *
 * `can_edit` is decided by the SERVER and sent with the payload. The browser does not work it
 * out from the signed-in role: a client that got it wrong would show a Zonal Head a Save
 * button that the server then refuses, which is a worse experience than not offering it.
 */
export type AdminMemberProfile = MemberProfile & { can_edit: boolean };

export type ListMembersRequest = {
  q?: string;
  is_active?: boolean;
  page?: number;
  page_size?: number;
};

export const memberAdminApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getMemberAccounts: builder.query<MemberAccountPage, ListMembersRequest | void>({
      query: (arg) => {
        const params = new URLSearchParams();
        if (arg?.q) params.set("q", arg.q);
        if (arg?.is_active !== undefined) params.set("is_active", String(arg.is_active));
        if (arg?.page) params.set("page", String(arg.page));
        if (arg?.page_size) params.set("page_size", String(arg.page_size));
        const qs = params.toString();
        return qs ? `/members?${qs}` : "/members";
      },
      transformResponse: (res: ApiEnvelope<MemberAccountPage>) => res.data,
      providesTags: (result) =>
        result
          ? [
              { type: "Members" as const, id: "LIST" },
              ...result.items.map((m) => ({ type: "Members" as const, id: m.id }))
            ]
          : [{ type: "Members" as const, id: "LIST" }]
    }),

    /**
     * Creates one member account. Admin and Zonal Head both reach this.
     *
     * Only the three basic fields; zone, party and the rest of the profile are the member's
     * own to fill. The server forces a password change at first sign-in, and no password
     * material comes back in the response.
     *
     * The server's `message` is surfaced verbatim on failure: it names the rule that was
     * broken (the ITS format, the password policy, or an ITS number already taken), which a
     * generic "could not create" would throw away.
     */
    createMemberAccount: builder.mutation<CreatedMemberAccount, CreateMemberRequest>({
      query: (body) => ({ url: "/members", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<CreatedMemberAccount>) => res.data,
      invalidatesTags: [{ type: "Members", id: "LIST" }]
    }),

    // NOT `getMemberProfile`: `memberApi` already injects an endpoint by that name for the
    // member's own profile. Two injectEndpoints calls sharing a name silently keep the first,
    // so this one would have quietly fetched /members/me/profile instead.
    getAdminMemberProfile: builder.query<AdminMemberProfile, number>({
      query: (id) => `/members/${id}/profile`,
      transformResponse: (res: ApiEnvelope<AdminMemberProfile>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "MemberProfileAdmin" as const, id }]
    }),

    /**
     * An administrator corrects a member's answers. The server refuses a Zonal Head, and
     * records which fields changed in `member_profile_edits` (names only, never values —
     * Tab 6 is medical data and FR-066 keeps it out of logs).
     */
    saveMemberProfileAsAdmin: builder.mutation<
      AdminMemberProfile,
      { id: number; body: MemberProfileInput }
    >({
      query: ({ id, body }) => ({ url: `/members/${id}/profile`, method: "PUT", body }),
      transformResponse: (res: ApiEnvelope<AdminMemberProfile>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "MemberProfileAdmin", id: arg.id },
        { type: "Members", id: arg.id },
        { type: "Members", id: "LIST" }
      ]
    }),

    /**
     * An administrator resets a member's password (FR-005a).
     *
     * The server refuses a Zonal Head, signs the member out everywhere, clears any lockout,
     * and records who did it. Nothing about the password comes back — the administrator
     * already has the value they typed.
     */
    resetMemberPassword: builder.mutation<
      { id: number; its_no: string; member_name: string | null; must_change_password: boolean },
      { id: number; password: string }
    >({
      query: ({ id, password }) => ({
        url: `/members/${id}/reset-password`,
        method: "POST",
        body: { password }
      }),
      transformResponse: (
        res: ApiEnvelope<{
          id: number;
          its_no: string;
          member_name: string | null;
          must_change_password: boolean;
        }>
      ) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "Members", id: arg.id },
        { type: "Members", id: "LIST" }
      ]
    }),

    /** `is_active` is the only field the server accepts here. */    setMemberActive: builder.mutation<
      { id: number; is_active: boolean },
      { id: number; is_active: boolean }
    >({
      query: ({ id, is_active }) => ({
        url: `/members/${id}`,
        method: "PATCH",
        body: { is_active }
      }),
      transformResponse: (res: ApiEnvelope<{ id: number; is_active: boolean }>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "Members", id: arg.id },
        { type: "Members", id: "LIST" }
      ]
    }),

    /**
     * The member's current photograph. Blob rather than JSON because the bytes are served
     * behind the bearer token, which an `<img src>` cannot supply.
     */
    getMemberPhoto: builder.query<Blob, number>({
      query: (id) => ({ url: `/members/${id}/photo`, responseHandler: (response) => response.blob() }),
      providesTags: ["MemberPhoto"]
    })
  })
});

export const {
  useGetMemberAccountsQuery,
  useGetAdminMemberProfileQuery,
  useSaveMemberProfileAsAdminMutation,
  useCreateMemberAccountMutation,
  useResetMemberPasswordMutation,
  useSetMemberActiveMutation,
  useGetMemberPhotoQuery
} = memberAdminApi;
