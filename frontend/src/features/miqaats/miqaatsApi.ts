import { api } from "../api/api";

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

export type Miqaat = {
  id: number;
  miqaat_name: string;
  english_date: string;
  hijri_date: string | null;
  is_active: 0 | 1;
};

export type CreateMiqaatRequest = {
  miqaat_name: string;
  english_date: string;
  hijri_date?: string | null;
  is_active?: 0 | 1;
};

export type UpdateMiqaatRequest = {
  id: number;
  miqaat_name: string;
  english_date: string;
  hijri_date?: string | null;
  is_active?: 0 | 1;
};

export const miqaatsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getMiqaats: builder.query<Miqaat[], void>({
      query: () => "/miqaats",
      transformResponse: (res: ApiEnvelope<Miqaat[]>) => res.data,
      providesTags: (result) =>
        result
          ? [
              { type: "Miqaats" as const, id: "LIST" },
              ...result.map((m) => ({ type: "Miqaats" as const, id: m.id }))
            ]
          : [{ type: "Miqaats" as const, id: "LIST" }]
    }),
    createMiqaat: builder.mutation<{ success: true }, CreateMiqaatRequest>({
      query: (body) => ({ url: "/miqaats", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: [{ type: "Miqaats", id: "LIST" }]
    }),
    updateMiqaat: builder.mutation<{ success: true }, UpdateMiqaatRequest>({
      query: ({ id, ...body }) => ({ url: `/miqaats/${id}`, method: "PUT", body }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "Miqaats", id: arg.id }, { type: "Miqaats", id: "LIST" }]
    }),
    deleteMiqaat: builder.mutation<{ success: true }, { id: number }>({
      query: ({ id }) => ({ url: `/miqaats/${id}`, method: "DELETE" }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "Miqaats", id: arg.id }, { type: "Miqaats", id: "LIST" }]
    })
  })
});

export const { useGetMiqaatsQuery, useCreateMiqaatMutation, useUpdateMiqaatMutation, useDeleteMiqaatMutation } =
  miqaatsApi;

