import { api } from "../api/api";

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

export type PendingPhoto = {
  id: number;
  member_account_id: number;
  its_no: string;
  member_name: string | null;
  zone_id: number | null;
  zone_name: string | null;
  content_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  approval_status: string;
  created_at: string;
  updated_at: string;
};

export const memberPhotoApprovalApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPendingPhotos: builder.query<PendingPhoto[], void>({
      query: () => "/member-photo-approvals",
      transformResponse: (res: ApiEnvelope<PendingPhoto[]>) => res.data,
      providesTags: [{ type: "Members" as const, id: "PHOTO_APPROVALS" }]
    }),

    approvePhoto: builder.mutation<{ success: boolean }, { photoId: number }>({
      query: ({ photoId }) => ({
        url: `/member-photo-approvals/${photoId}/approve`,
        method: "POST"
      }),
      transformResponse: (res: ApiEnvelope<{ success: boolean }>) => res.data,
      invalidatesTags: [{ type: "Members" as const, id: "PHOTO_APPROVALS" }]
    }),

    rejectPhoto: builder.mutation<{ success: boolean }, { photoId: number; reason?: string }>({
      query: ({ photoId, reason }) => ({
        url: `/member-photo-approvals/${photoId}/reject`,
        method: "POST",
        body: { reason }
      }),
      transformResponse: (res: ApiEnvelope<{ success: boolean }>) => res.data,
      invalidatesTags: [{ type: "Members" as const, id: "PHOTO_APPROVALS" }]
    })
  })
});

export const { useGetPendingPhotosQuery, useApprovePhotoMutation, useRejectPhotoMutation } = memberPhotoApprovalApi;
