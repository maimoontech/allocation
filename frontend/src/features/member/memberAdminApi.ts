import { api } from "../api/api";

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

/**
 * The identifying details the administrator's member list shows. Health values and the rest
 * of the twelve-tab profile stay private (FR-065, FR-101), and no password material is ever
 * returned (FR-015). Photo bytes are fetched separately, per member.
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
  useSetMemberActiveMutation,
  useGetMemberPhotoQuery
} = memberAdminApi;
