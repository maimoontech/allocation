import { api } from "../api/api";

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

export type Mohallah = {
  id: number;
  zone_id: number;
  zone_name: string;
  mohallah_name: string;
  coordinator_name: string;
  contact_number: string | null;
  whatsapp_number: string | null;
  last_login_at: string | null;
  created_at: string;
};

export type CreateMohallahRequest = {
  zone_id: number;
  mohallah_name: string;
  coordinator_name: string;
  contact_number?: string | null;
  whatsapp_number?: string | null;
  password: string;
};

export type UpdateMohallahRequest = {
  id: number;
  zone_id: number;
  mohallah_name: string;
  coordinator_name: string;
  contact_number?: string | null;
  whatsapp_number?: string | null;
  password?: string;
};

export const mohallahsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getMohallahs: builder.query<Mohallah[], { zone_id?: number } | void>({
      query: (arg) => {
        const zoneId = arg && "zone_id" in arg ? arg.zone_id : undefined;
        return zoneId ? `/mohallahs?zone_id=${zoneId}` : "/mohallahs";
      },
      transformResponse: (res: ApiEnvelope<Mohallah[]>) => res.data,
      providesTags: (result) =>
        result
          ? [
              { type: "Mohallahs" as const, id: "LIST" },
              ...result.map((m) => ({ type: "Mohallahs" as const, id: m.id }))
            ]
          : [{ type: "Mohallahs" as const, id: "LIST" }]
    }),
    createMohallah: builder.mutation<{ success: true }, CreateMohallahRequest>({
      query: (body) => ({ url: "/mohallahs", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: [{ type: "Mohallahs", id: "LIST" }]
    }),
    updateMohallah: builder.mutation<{ success: true }, UpdateMohallahRequest>({
      query: ({ id, ...body }) => ({ url: `/mohallahs/${id}`, method: "PUT", body }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "Mohallahs", id: arg.id }, { type: "Mohallahs", id: "LIST" }]
    }),
    deleteMohallah: builder.mutation<{ success: true }, { id: number }>({
      query: ({ id }) => ({ url: `/mohallahs/${id}`, method: "DELETE" }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "Mohallahs", id: arg.id }, { type: "Mohallahs", id: "LIST" }]
    })
  })
});

export const {
  useGetMohallahsQuery,
  useCreateMohallahMutation,
  useUpdateMohallahMutation,
  useDeleteMohallahMutation
} = mohallahsApi;

