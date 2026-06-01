import { api } from "../api/api";

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

export type Party = {
  id: number;
  its_no: string;
  leader_name: string;
  party_name: string;
  zone_id: number;
  zone_name: string;
  category: "A" | "B" | "C" | "H";
  is_active: 0 | 1;
  last_login_at: string | null;
  created_at: string;
};

export type CreatePartyRequest = {
  zone_id?: number;
  its_no: string;
  leader_name: string;
  party_name: string;
  category: Party["category"];
  is_active?: 0 | 1;
  password: string;
};

export type UpdatePartyRequest = {
  id: number;
  zone_id?: number;
  its_no: string;
  leader_name: string;
  party_name: string;
  category: Party["category"];
  is_active?: 0 | 1;
  password?: string;
};

export const partiesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getParties: builder.query<Party[], { zone_id?: number } | void>({
      query: (arg) => {
        const zoneId = arg && "zone_id" in arg ? arg.zone_id : undefined;
        return zoneId ? `/parties?zone_id=${zoneId}` : "/parties";
      },
      transformResponse: (res: ApiEnvelope<Party[]>) => res.data,
      providesTags: (result) =>
        result
          ? [{ type: "Parties" as const, id: "LIST" }, ...result.map((p) => ({ type: "Parties" as const, id: p.id }))]
          : [{ type: "Parties" as const, id: "LIST" }]
    }),
    createParty: builder.mutation<{ success: true }, CreatePartyRequest>({
      query: (body) => ({ url: "/parties", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: [{ type: "Parties", id: "LIST" }]
    }),
    updateParty: builder.mutation<{ success: true }, UpdatePartyRequest>({
      query: ({ id, ...body }) => ({ url: `/parties/${id}`, method: "PUT", body }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "Parties", id: arg.id }, { type: "Parties", id: "LIST" }]
    }),
    deleteParty: builder.mutation<{ success: true }, { id: number }>({
      query: ({ id }) => ({ url: `/parties/${id}`, method: "DELETE" }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "Parties", id: arg.id }, { type: "Parties", id: "LIST" }]
    })
  })
});

export const { useGetPartiesQuery, useCreatePartyMutation, useUpdatePartyMutation, useDeletePartyMutation } = partiesApi;
