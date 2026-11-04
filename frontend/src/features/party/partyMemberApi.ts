import { api } from "../api/api";

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

/**
 * A party's own roster, scoped by the server to the party in the token.
 *
 * The response carries names and a `has_photo` flag only. The photograph itself is a separate
 * authenticated request per member, because image bytes do not belong in a list payload.
 */
export type PartyMember = {
  id: number;
  its_no: string;
  first_prefix: string | null;
  name: string | null;
  father_prefix: string | null;
  father_name: string | null;
  surname: string | null;
  has_photo: boolean;
};

export type PartyMemberPage = {
  items: PartyMember[];
  total: number;
  page: number;
  page_size: number;
};

export type ListPartyMembersRequest = {
  q?: string;
  page?: number;
  page_size?: number;
};

export const partyMemberApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPartyMembers: builder.query<PartyMemberPage, ListPartyMembersRequest | void>({
      query: (arg) => {
        const params = new URLSearchParams();
        if (arg?.q) params.set("q", arg.q);
        if (arg?.page) params.set("page", String(arg.page));
        if (arg?.page_size) params.set("page_size", String(arg.page_size));
        const query = params.toString();
        return { url: query ? `/party-members?${query}` : "/party-members" };
      },
      transformResponse: (response: ApiEnvelope<PartyMemberPage>) => response.data,
      providesTags: ["PartyMembers"]
    }),

    /**
     * Blob rather than JSON: the endpoint sends image bytes with a bearer token, which an
     * `<img src>` cannot supply. A member of another party is answered 404, so a failed load
     * is simply a missing thumbnail, not an error state to surface.
     */
    getPartyMemberPhoto: builder.query<Blob, number>({
      query: (memberId) => ({
        url: `/party-members/${memberId}/photo`,
        responseHandler: (response) => response.blob()
      }),
      providesTags: ["PartyMembers"]
    })
  })
});

export const { useGetPartyMembersQuery, useGetPartyMemberPhotoQuery } = partyMemberApi;
