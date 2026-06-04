import { api } from "../api/api";

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

export type Venue = {
  id: number;
  venue_name: string;
  mohallah_id: number;
  mohallah_name: string;
  zone_id: number;
  zone_name: string;
  coordinator_name: string | null;
  contact_number: string | null;
  whatsapp_number: string | null;
  min_parties: number;
  max_parties: number;
  is_active: 0 | 1;
  last_login_at?: string | null;
  created_at: string;
};

export type CreateVenueRequest = {
  venue_name: string;
  mohallah_id: number;
  coordinator_name?: string | null;
  contact_number?: string | null;
  whatsapp_number?: string | null;
  password: string;
  min_parties?: number;
  max_parties?: number;
  is_active?: 0 | 1;
};

export type UpdateVenueRequest = {
  id: number;
  venue_name: string;
  mohallah_id: number;
  coordinator_name?: string | null;
  contact_number?: string | null;
  whatsapp_number?: string | null;
  password?: string;
  min_parties?: number;
  max_parties?: number;
  is_active?: 0 | 1;
};

export const venuesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getVenues: builder.query<Venue[], { zone_id?: number } | void>({
      query: (arg) => {
        const zoneId = arg && "zone_id" in arg ? arg.zone_id : undefined;
        return zoneId ? `/venues?zone_id=${zoneId}` : "/venues";
      },
      transformResponse: (res: ApiEnvelope<Venue[]>) => res.data,
      providesTags: (result) =>
        result
          ? [{ type: "Venues" as const, id: "LIST" }, ...result.map((v) => ({ type: "Venues" as const, id: v.id }))]
          : [{ type: "Venues" as const, id: "LIST" }]
    }),
    createVenue: builder.mutation<{ success: true }, CreateVenueRequest>({
      query: (body) => ({ url: "/venues", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: [{ type: "Venues", id: "LIST" }]
    }),
    updateVenue: builder.mutation<{ success: true }, UpdateVenueRequest>({
      query: ({ id, ...body }) => ({ url: `/venues/${id}`, method: "PUT", body }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "Venues", id: arg.id }, { type: "Venues", id: "LIST" }]
    }),
    deleteVenue: builder.mutation<{ success: true }, { id: number }>({
      query: ({ id }) => ({ url: `/venues/${id}`, method: "DELETE" }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "Venues", id: arg.id }, { type: "Venues", id: "LIST" }]
    })
  })
});

export const { useGetVenuesQuery, useCreateVenueMutation, useUpdateVenueMutation, useDeleteVenueMutation } = venuesApi;
