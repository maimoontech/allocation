import { api } from "../api/api";

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

/**
 * A party's own roster, scoped by the server to the party in the token.
 *
 * The response carries names, a `has_photo` flag, and two facts ABOUT the profile that
 * disclose nothing from it (FR-112c). The photograph itself is a separate authenticated
 * request per member, because image bytes do not belong in a list payload.
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
  /**
   * When the profile was last saved. Moves on any successful save, including one that
   * changed only a repeatable section, and also when an administrator corrects the profile
   * (FR-047a) - which is why the page does not attribute it to the member.
   */
  profile_updated_at: string | null;
  /**
   * FR-112c. How much of their own twelve-tab form the member has answered, 0 to 100.
   *
   * Derived from PRESENCE - whether each box holds something, never what it holds - so it
   * says how far along a member is without disclosing a single answer. The same measure the
   * administrator's list shows and the dashboard averages.
   */
  completion_percent: number;
  /** The two halves of that fraction. The denominator counts only what THIS member was asked. */
  completion_answered: number;
  completion_asked: number;
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
