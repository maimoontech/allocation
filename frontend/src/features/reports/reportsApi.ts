import { api } from "../api/api";

type ApiEnvelope<T> = { success: boolean; data: T; message?: string };

export type StatusSummary = {
  parties: { active: number; inactive: number };
  venues: { active: number; inactive: number };
};

export type MiqaatScheduleRow = {
  id: number;
  zone_name: string;
  mohallah_name: string;
  venue_name: string;
  party_name: string;
  category: "A" | "B" | "C" | "H";
  its_no?: string | null;
  leader_name?: string | null;
  is_manual: 0 | 1;
};

export type PartyHistoryRow = {
  venue_id: number;
  venue_name: string;
  visit_count: number;
  first_visited_at: string;
  last_visited_at: string;
};

export type ZoneScheduleSummaryRow = {
  zone_name: string;
  mohallah_name: string;
  venue_name: string;
  total_parties: number;
  cat_a: number;
  cat_b: number;
  cat_c: number;
  manual_count: number;
};

export type AttendanceRow = {
  schedule_id: number;
  zone_name: string;
  mohallah_name: string;
  venue_name: string;
  party_name: string;
  category: "A" | "B" | "C" | "H";
  coordinator_id: number | null;
  attended_properly: 0 | 1 | null;
  recitation_score: number | null;
  discipline_score: number | null;
  attendance_score: number | null;
  overall_score: number | null;
  comments: string | null;
  created_at: string | null;
};

export type PerformanceSummaryRow = {
  party_id: number;
  party_name: string;
  category: "A" | "B" | "C" | "H";
  zone_name: string;
  avg_overall: number | null;
  ratings_count: number;
};

export type PerformanceTrendRow = {
  miqaat_id: number;
  miqaat_name: string;
  english_date: string;
  avg_overall: number | null;
  avg_recitation: number | null;
  avg_discipline: number | null;
  avg_attendance: number | null;
  attended_count: number;
  rated_count: number;
};

export type MicTrendRow = {
  miqaat_id: number;
  miqaat_name: string;
  english_date: string;
  avg_mic: number | null;
  rated_count: number;
};

export type QuarterlyPartyRow = {
  party_id: number;
  party_name: string;
  category: "A" | "B" | "C" | "H";
  zone_name: string;
  avg_overall: number | null;
  ratings_count: number;
};

export type QuarterlyResponse = {
  best: QuarterlyPartyRow[];
  worst: QuarterlyPartyRow[];
};

export type ManualEditRow = {
  edit_id: number;
  schedule_id: number;
  edited_by_role: string;
  edited_by_id: number;
  edited_at: string;
  miqaat_name: string;
  english_date: string;
  zone_name: string;
  mohallah_name: string;
  old_venue_name: string;
  old_party_name: string;
  new_venue_name: string;
  new_party_name: string;
};

export const reportsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getStatusSummary: builder.query<StatusSummary, { zone_id?: number } | void>({
      query: (arg) => {
        const zoneId = arg && "zone_id" in arg ? arg.zone_id : undefined;
        return zoneId ? `/reports/status-summary?zone_id=${zoneId}` : "/reports/status-summary";
      },
      transformResponse: (res: ApiEnvelope<StatusSummary>) => res.data,
      providesTags: [{ type: "Reports", id: "STATUS" }]
    }),
    getMiqaatSchedule: builder.query<MiqaatScheduleRow[], { miqaat_id: number; zone_id?: number }>({
      query: ({ miqaat_id, zone_id }) => {
        const params = new URLSearchParams();
        params.set("miqaat_id", String(miqaat_id));
        if (zone_id) params.set("zone_id", String(zone_id));
        return `/reports/miqaat-schedule?${params.toString()}`;
      },
      transformResponse: (res: ApiEnvelope<MiqaatScheduleRow[]>) => res.data,
      providesTags: (_r, _e, arg) => [{ type: "Reports", id: `MIQAAT_${arg.miqaat_id}` }]
    }),
    getPartyHistory: builder.query<PartyHistoryRow[], { party_id: number }>({
      query: ({ party_id }) => `/reports/party-history?party_id=${party_id}`,
      transformResponse: (res: ApiEnvelope<PartyHistoryRow[]>) => res.data,
      providesTags: (_r, _e, arg) => [{ type: "Reports", id: `PARTY_${arg.party_id}` }]
    }),
    getZoneScheduleSummary: builder.query<ZoneScheduleSummaryRow[], { miqaat_id: number; zone_id?: number }>({
      query: ({ miqaat_id, zone_id }) => {
        const params = new URLSearchParams();
        params.set("miqaat_id", String(miqaat_id));
        if (zone_id) params.set("zone_id", String(zone_id));
        return `/reports/zone-schedule?${params.toString()}`;
      },
      transformResponse: (res: ApiEnvelope<ZoneScheduleSummaryRow[]>) => res.data,
      providesTags: (_r, _e, arg) => [{ type: "Reports", id: `ZONE_SCHEDULE_${arg.miqaat_id}` }]
    }),
    getAttendanceReport: builder.query<AttendanceRow[], { miqaat_id: number; zone_id?: number }>({
      query: ({ miqaat_id, zone_id }) => {
        const params = new URLSearchParams();
        params.set("miqaat_id", String(miqaat_id));
        if (zone_id) params.set("zone_id", String(zone_id));
        return `/reports/attendance?${params.toString()}`;
      },
      transformResponse: (res: ApiEnvelope<AttendanceRow[]>) => res.data,
      providesTags: (_r, _e, arg) => [{ type: "Reports", id: `ATTENDANCE_${arg.miqaat_id}` }]
    }),
    getPerformanceSummary: builder.query<PerformanceSummaryRow[], { zone_id?: number } | void>({
      query: (arg) => {
        const zoneId = arg && "zone_id" in arg ? arg.zone_id : undefined;
        return zoneId ? `/reports/performance?zone_id=${zoneId}` : "/reports/performance";
      },
      transformResponse: (res: ApiEnvelope<PerformanceSummaryRow[]>) => res.data,
      providesTags: [{ type: "Reports", id: "PERF_SUMMARY" }]
    }),
    getPerformanceTrend: builder.query<{ performance_trend: PerformanceTrendRow[]; mic_trend: MicTrendRow[] }, { party_id: number }>({
      query: ({ party_id }) => `/reports/performance?party_id=${party_id}`,
      transformResponse: (res: ApiEnvelope<{ performance_trend: PerformanceTrendRow[]; mic_trend: MicTrendRow[] }>) => res.data,
      providesTags: (_r, _e, arg) => [{ type: "Reports", id: `PERF_TREND_${arg.party_id}` }]
    }),
    getQuarterlyReview: builder.query<QuarterlyResponse, { year: number; quarter: number; zone_id?: number }>({
      query: ({ year, quarter, zone_id }) => {
        const params = new URLSearchParams();
        params.set("year", String(year));
        params.set("quarter", String(quarter));
        if (zone_id) params.set("zone_id", String(zone_id));
        return `/reports/quarterly?${params.toString()}`;
      },
      transformResponse: (res: ApiEnvelope<QuarterlyResponse>) => res.data,
      providesTags: (_r, _e, arg) => [{ type: "Reports", id: `QUARTERLY_${arg.year}_${arg.quarter}` }]
    }),
    getManuallyEdited: builder.query<ManualEditRow[], { miqaat_id?: number; zone_id?: number } | void>({
      query: (arg) => {
        const params = new URLSearchParams();
        if (arg && "miqaat_id" in arg && arg.miqaat_id) params.set("miqaat_id", String(arg.miqaat_id));
        if (arg && "zone_id" in arg && arg.zone_id) params.set("zone_id", String(arg.zone_id));
        const qs = params.toString();
        return qs ? `/reports/manually-edited?${qs}` : "/reports/manually-edited";
      },
      transformResponse: (res: ApiEnvelope<ManualEditRow[]>) => res.data,
      providesTags: [{ type: "Reports", id: "MANUAL_EDITS" }]
    })
  })
});

export const {
  useGetStatusSummaryQuery,
  useGetMiqaatScheduleQuery,
  useGetPartyHistoryQuery,
  useGetZoneScheduleSummaryQuery,
  useGetAttendanceReportQuery,
  useGetPerformanceSummaryQuery,
  useGetPerformanceTrendQuery,
  useGetQuarterlyReviewQuery,
  useGetManuallyEditedQuery
} = reportsApi;
