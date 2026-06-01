import { api } from "../api/api";

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

export type Zone = {
  id: number;
  zone_name: string;
  coordinator_name: string;
  contact_number: string | null;
  whatsapp_number: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateZoneRequest = {
  zone_name: string;
  coordinator_name: string;
  contact_number?: string | null;
  whatsapp_number?: string | null;
  password: string;
};

export type UpdateZoneRequest = {
  id: number;
  zone_name: string;
  coordinator_name: string;
  contact_number?: string | null;
  whatsapp_number?: string | null;
  password?: string;
};

export const zonesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getZones: builder.query<Zone[], void>({
      query: () => "/zones",
      transformResponse: (res: ApiEnvelope<Zone[]>) => res.data,
      providesTags: (result) =>
        result
          ? [{ type: "Zones" as const, id: "LIST" }, ...result.map((z) => ({ type: "Zones" as const, id: z.id }))]
          : [{ type: "Zones" as const, id: "LIST" }]
    }),
    createZone: builder.mutation<{ success: true }, CreateZoneRequest>({
      query: (body) => ({ url: "/zones", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: [{ type: "Zones", id: "LIST" }]
    }),
    updateZone: builder.mutation<{ success: true }, UpdateZoneRequest>({
      query: ({ id, ...body }) => ({ url: `/zones/${id}`, method: "PUT", body }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "Zones", id: arg.id }, { type: "Zones", id: "LIST" }]
    }),
    deleteZone: builder.mutation<{ success: true }, { id: number }>({
      query: ({ id }) => ({ url: `/zones/${id}`, method: "DELETE" }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "Zones", id: arg.id }, { type: "Zones", id: "LIST" }]
    })
  })
});

export const { useGetZonesQuery, useCreateZoneMutation, useUpdateZoneMutation, useDeleteZoneMutation } = zonesApi;

