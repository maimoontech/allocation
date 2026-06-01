import { api } from "../api/api";

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

export type PartyMicRatingRequest = {
  schedule_id: number;
  score: number;
  comments?: string | null;
};

export type CoordinatorPerformanceRatingRequest = {
  schedule_id: number;
  attended_properly: boolean;
  recitation: number;
  discipline: number;
  attendance: number;
  overall: number;
  comments?: string | null;
};

export const ratingsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    submitPartyMicRating: builder.mutation<{ success: true }, PartyMicRatingRequest>({
      query: (body) => ({ url: "/ratings", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: [{ type: "Ratings", id: "LIST" }]
    }),
    submitPerformanceRating: builder.mutation<{ success: true }, CoordinatorPerformanceRatingRequest>({
      query: (body) => ({ url: "/ratings/performance", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: [{ type: "Ratings", id: "LIST" }]
    })
  })
});

export const { useSubmitPartyMicRatingMutation, useSubmitPerformanceRatingMutation } = ratingsApi;

