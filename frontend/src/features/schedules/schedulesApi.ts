import { api } from "../api/api";

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

export type ScheduleRow = {
  id: number;
  miqaat_id: number;
  miqaat_name: string;
  english_date: string;
  hijri_date?: string | null;
  venue_id: number;
  venue_name: string;
  venue_coordinator_name?: string | null;
  venue_contact_number?: string | null;
  mohallah_id: number;
  mohallah_name: string;
  zone_id: number;
  zone_name: string;
  party_id: number;
  party_name: string;
  category: "A" | "B" | "C" | "H";
  party_its_no?: string | null;
  party_leader_name?: string | null;
  party_contact_number?: string | null;
  party_whatsapp_number?: string | null;
  is_manual: 0 | 1;
  all_assigned_venues_completed?: 0 | 1;
  created_at: string;
  performance_submitted?: 0 | 1;
  attended_properly?: 0 | 1;
  recitation_score?: number | null;
  discipline_score?: number | null;
  attendance_score?: number | null;
  overall_score?: number | null;
  performance_comments?: string | null;
};

export type GenerateScheduleRequest = {
  miqaat_id: number;
  zone_id?: number;
  overwrite: boolean;
};

export type DeleteSchedulesByScopeRequest = {
  miqaat_id: number;
  zone_id?: number;
};

export const schedulesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getSchedules: builder.query<ScheduleRow[], { miqaat_id?: number; zone_id?: number } | void>({
      query: (arg) => {
        const params = new URLSearchParams();
        if (arg && "miqaat_id" in arg && arg.miqaat_id) params.set("miqaat_id", String(arg.miqaat_id));
        if (arg && "zone_id" in arg && arg.zone_id) params.set("zone_id", String(arg.zone_id));
        const qs = params.toString();
        return qs ? `/schedules?${qs}` : "/schedules";
      },
      transformResponse: (res: ApiEnvelope<ScheduleRow[]>) => res.data,
      providesTags: (result) =>
        result
          ? [
              { type: "Schedules" as const, id: "LIST" },
              ...result.map((s) => ({ type: "Schedules" as const, id: s.id }))
            ]
          : [{ type: "Schedules" as const, id: "LIST" }]
    }),
    generateSchedule: builder.mutation<{ assignments: { venueId: number; partyId: number; isManual: 0 | 1 }[] }, GenerateScheduleRequest>({
      query: (body) => ({ url: "/schedules/generate", method: "POST", body }),
      transformResponse: (res: ApiEnvelope<{ assignments: { venueId: number; partyId: number; isManual: 0 | 1 }[] }>) => res.data,
      invalidatesTags: [{ type: "Schedules", id: "LIST" }]
    }),
    updateSchedule: builder.mutation<{ success: true }, { id: number; venue_id: number; party_id: number }>({
      query: ({ id, ...body }) => ({ url: `/schedules/${id}`, method: "PUT", body }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "Schedules", id: arg.id }, { type: "Schedules", id: "LIST" }]
    }),
    deleteSchedule: builder.mutation<{ success: true }, { id: number }>({
      query: ({ id }) => ({ url: `/schedules/${id}`, method: "DELETE" }),
      transformResponse: (res: ApiEnvelope<{ success: true }>) => res.data,
      invalidatesTags: (_r, _e, arg) => [{ type: "Schedules", id: arg.id }, { type: "Schedules", id: "LIST" }]
    }),
    deleteSchedulesByScope: builder.mutation<{ success: true; deleted: number }, DeleteSchedulesByScopeRequest>({
      query: ({ miqaat_id, zone_id }) => {
        const params = new URLSearchParams();
        params.set("miqaat_id", String(miqaat_id));
        if (zone_id) params.set("zone_id", String(zone_id));
        return { url: `/schedules?${params.toString()}`, method: "DELETE" };
      },
      transformResponse: (res: ApiEnvelope<{ success: true; deleted: number }>) => res.data,
      invalidatesTags: [{ type: "Schedules", id: "LIST" }]
    })
  })
});

export const {
  useGetSchedulesQuery,
  useGenerateScheduleMutation,
  useUpdateScheduleMutation,
  useDeleteScheduleMutation,
  useDeleteSchedulesByScopeMutation
} = schedulesApi;
