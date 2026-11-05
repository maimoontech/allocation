import { api } from "../api/api";

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

/** One of the ten lists, as the index reports it. */
export type LookupSummary = {
  entity: string;
  label: string;
  used_for: string;
  total: number;
  active: number;
  draft: number;
};

export type LookupRow = {
  id: number;
  name: string;
  display_order: number;
  is_active: 0 | 1;
  is_draft: 0 | 1;
  /** How many member records point at this value. Non-zero means it cannot be deleted. */
  in_use: number;
  /** Only on a list with `has_year` — "Ashara with Aqa Moula" (FR-077b). */
  hijri_year?: number | null;
};

export type LookupDetail = {
  entity: string;
  label: string;
  used_for: string;
  /** True when every value in this list belongs to one Hijri year. */
  has_year?: boolean;
  rows: LookupRow[];
};

export type LookupWrite = {
  name?: string;
  display_order?: number;
  is_active?: 0 | 1;
  is_draft?: 0 | 1;
  hijri_year?: number | null;
};

export const memberLookupAdminApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getMemberLookupIndex: builder.query<LookupSummary[], void>({
      query: () => "/member-lookups",
      transformResponse: (res: ApiEnvelope<LookupSummary[]>) => res.data,
      providesTags: [{ type: "MemberLookups" as const, id: "INDEX" }]
    }),

    getMemberLookupList: builder.query<LookupDetail, string>({
      query: (entity) => `/member-lookups/${entity}`,
      transformResponse: (res: ApiEnvelope<LookupDetail>) => res.data,
      providesTags: (_r, _e, entity) => [{ type: "MemberLookups" as const, id: entity }]
    }),

    createMemberLookup: builder.mutation<{ id: number }, { entity: string } & LookupWrite>({
      query: ({ entity, ...body }) => ({
        url: `/member-lookups/${entity}`,
        method: "POST",
        body
      }),
      transformResponse: (res: ApiEnvelope<{ id: number }>) => res.data,
      // The index's counts change too, so both are invalidated.
      invalidatesTags: (_r, _e, arg) => [
        { type: "MemberLookups", id: arg.entity },
        { type: "MemberLookups", id: "INDEX" }
      ]
    }),

    updateMemberLookup: builder.mutation<
      { success: true },
      { entity: string; id: number } & LookupWrite
    >({
      query: ({ entity, id, ...body }) => ({
        url: `/member-lookups/${entity}/${id}`,
        method: "PATCH",
        body
      }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "MemberLookups", id: arg.entity },
        { type: "MemberLookups", id: "INDEX" }
      ]
    }),

    deleteMemberLookup: builder.mutation<{ success: true }, { entity: string; id: number }>({
      query: ({ entity, id }) => ({
        url: `/member-lookups/${entity}/${id}`,
        method: "DELETE"
      }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "MemberLookups", id: arg.entity },
        { type: "MemberLookups", id: "INDEX" }
      ]
    })
  })
});

export const {
  useGetMemberLookupIndexQuery,
  useGetMemberLookupListQuery,
  useCreateMemberLookupMutation,
  useUpdateMemberLookupMutation,
  useDeleteMemberLookupMutation
} = memberLookupAdminApi;
