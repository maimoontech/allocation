import { api } from "../api/api";
import type { AuthUser } from "../../types";

/**
 * Member endpoints, injected onto the shared `createApi` base so they reuse its bearer-token
 * header and error handling.
 *
 * Only the authentication slice exists so far. The profile, lookups and photo endpoints
 * arrive with Phase 6.
 */

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type MemberChangePasswordRequest = {
  current_password: string;
  new_password: string;
  confirm_password: string;
};

/**
 * Unlike the existing roles' change-password response, the member one returns a FRESH token
 * pair. The member's previous token predates the change and is rejected from that point on
 * (FR-022), so the client must swap it in or the member is signed out mid-flow.
 */
export type MemberChangePasswordResponse = {
  success: boolean;
  token: string;
  refresh_token: string;
  user: AuthUser;
};

export type LookupValue = { id: number; name: string; is_draft: boolean };
/**
 * Tab 3 offers inactive Hizbs as well as active ones (FR-048a), so `is_active` has to travel
 * with each row — a member whose own Hizb was deactivated must still see it selected.
 */
export type PartyOption = { id: number; name: string; zone_id: number; is_active: boolean };
export type MohallahOption = { id: number; name: string; zone_id: number; is_draft: boolean };

/**
 * Tab 9's Venue (FR-077c), which replaced Mohallah. Active and inactive alike, so a member
 * recording an old Ashara can still name a venue that has since been retired.
 */
export type VenueOption = {
  id: number;
  name: string;
  mohallah_id: number;
  is_active: boolean;
};
/**
 * FR-077b. Aqa Moula TUS holds Ashara in one place a year, so each place carries its year and
 * Tab 9 shows it for that year rather than asking. `null` until an administrator sets one.
 */
export type AqaMoulaPlace = LookupValue & { hijri_year: number | null };

/** Everything the twelve-tab form needs to render its dropdowns, in one response. */
export type MemberLookups = {
  titles: LookupValue[];
  sharafs: LookupValue[];
  halqas: LookupValue[];
  mozes: LookupValue[];
  /** Where Aqa Moula TUS held Ashara Mubaraka. Separate from `mozes` — see Tab 9. */
  aqa_moula_asharas: AqaMoulaPlace[];
  places: LookupValue[];
  sanads: LookupValue[];
  marital_statuses: LookupValue[];
  skills: LookupValue[];
  tamreen_frequencies: LookupValue[];
  tamreen_methods: LookupValue[];
  zones: LookupValue[];
  parties: PartyOption[];
  mohallahs: MohallahOption[];
  venues: VenueOption[];
  /** Server-computed upper bound for the Tab 9 year range (FR-076). */
  current_hijri_year: number;
};

export type TitleEntry = { title_id: number; title_year: number };
export type SharafEntry = { sharaf_id: number; sharaf_year: number };
export type PlaceVisitEntry = { place_id: number; times_count: number; years: number[] };
export type AsharaEntry = {
  attended_with: string;
  hijri_year: number;
  /** With Aamil only. The server clears it when the member attended with Aqa Moula TUS. */
  moze_id: number | null;
  /** With Aamil only. The server clears it when the member attended with Aqa Moula TUS. */
  mohallah_id: number | null;
  /** With Aamil only. Replaced `mohallah_id` on 2026-11-06 (FR-077c). */
  venue_id: number | null;
  /** With Aqa Moula TUS only. The server clears it when they attended with their Aamil. */
  aqa_moula_ashara_id: number | null;
};

/**
 * The profile as the server returns it.
 *
 * `its_no`, the `dob_hijri_*` fields and `bmi` are derived and read-only: the server ignores
 * them on a save (FR-034, FR-039, FR-064), so sending an unchanged read response back is
 * safe.
 */
export type MemberProfile = {
  its_no: string;
  has_photo: boolean;
  updated_at: string | null;

  first_prefix: string | null;
  name: string | null;
  father_prefix: string | null;
  father_name: string | null;
  surname: string | null;
  dob_gregorian: string | null;
  dob_hijri_day: number | null;
  dob_hijri_month: number | null;
  dob_hijri_year: number | null;
  dob_hijri_text: string | null;
  marital_status_id: number | null;
  residence_address: string | null;
  phone_no: string | null;
  mobile_no_1: string | null;
  mobile_no_2: string | null;
  whatsapp_no_1: string | null;
  whatsapp_no_2: string | null;
  email: string | null;

  prefix_year: number | null;

  zone_id: number | null;
  party_id: number | null;
  hizb_role: string | null;
  /** FR-049a. Hijri, 1375 AH to the current Hijri year — a lower floor than the other years. */
  zikr_e_hussain_since_year: number | null;

  occupation_type: string | null;
  organisation_name: string | null;
  designation: string | null;
  occupation_since_year: number | null;
  work_address: string | null;
  work_phone_no: string | null;

  education_level: string | null;
  major_subjects: string | null;
  education_status: string | null;
  has_hifz_sanad: boolean | null;
  sanad_id: number | null;
  hifz_current_surah: string | null;
  hifz_current_ayyah: string | null;
  hifz_last_update: string | null;

  blood_group: string | null;
  is_regular_donor: boolean | null;
  last_donation_date: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;

  asbaq_level: string | null;
  halqa_id: number | null;
  asbaq_ustad: string | null;

  attends_karachi_tamreen: boolean | null;
  tamreen_absence_reason: string | null;
  party_tamreen_frequency_id: number | null;
  solo_tamreen_frequency_id: number | null;
  tamreen_method_id: number | null;
  takes_ustad_assistance: boolean | null;
  uses_idaratuz_zakereen_books: boolean | null;

  khidmat_type: string | null;
  sansta_name: string | null;
  umoor_name: string | null;
  khidmat_designation: string | null;
  khidmat_since_year: number | null;

  titles: TitleEntry[];
  sharafs: SharafEntry[];
  skill_ids: number[];
  places_visited: PlaceVisitEntry[];
  ashara_attendances: AsharaEntry[];
};

/** A save sends only what changed, so every field is optional. */
export type MemberProfileInput = Partial<
  Omit<
    MemberProfile,
    "its_no" | "has_photo" | "updated_at" | "dob_hijri_day" | "dob_hijri_month" | "dob_hijri_year" | "dob_hijri_text" | "bmi"
  >
> & {
  /** The `updated_at` last read, so a concurrent edit returns 409 rather than being lost. */
  if_unmodified_since?: string | null;
};

/** One validation failure, carrying the tab the UI should open (FR-029). */
export type ProfileFieldError = { tab: number; field: string; message: string };

export type PhotoMeta = {
  content_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  sha256: string;
};

export const memberApi = api.injectEndpoints({
  endpoints: (builder) => ({
    memberChangePassword: builder.mutation<
      MemberChangePasswordResponse,
      MemberChangePasswordRequest
    >({
      query: (body) => ({
        url: "/auth/change-password",
        method: "POST",
        body
      }),
      transformResponse: (response: ApiEnvelope<MemberChangePasswordResponse>) => response.data
    }),

    getMemberLookups: builder.query<MemberLookups, void>({
      query: () => "/members/lookups",
      transformResponse: (response: ApiEnvelope<MemberLookups>) => response.data
    }),

    getMemberProfile: builder.query<MemberProfile, void>({
      query: () => "/members/me/profile",
      transformResponse: (response: ApiEnvelope<MemberProfile>) => response.data
    }),

    /**
     * The member's photograph as bytes, for the header avatar. The endpoint needs the bearer
     * token, so an `<img src>` cannot be pointed at it directly; the caller turns this Blob
     * into an object URL. Kept separate from the profile so the image is cached and shared,
     * and refetched by tag when a new photo is uploaded or the current one is removed.
     */
    getMemberPhotoBlob: builder.query<Blob, void>({
      query: () => ({
        url: "/members/me/photo",
        responseHandler: (response) => response.blob()
      }),
      providesTags: ["MemberPhoto"]
    }),

    saveMemberProfile: builder.mutation<MemberProfile, MemberProfileInput>({
      query: (body) => ({ url: "/members/me/profile", method: "PUT", body }),
      transformResponse: (response: ApiEnvelope<MemberProfile>) => response.data,
      // The response IS the saved profile, so the cache is updated from it rather than
      // invalidated and refetched.
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            memberApi.util.updateQueryData("getMemberProfile", undefined, () => data)
          );
        } catch {
          // A failed save leaves the cache alone; the page shows the errors.
        }
      }
    }),

    setMemberPhoto: builder.mutation<PhotoMeta, { content_type: string; data_base64: string }>({
      query: (body) => ({ url: "/members/me/photo", method: "PUT", body }),
      transformResponse: (response: ApiEnvelope<PhotoMeta>) => response.data,
      invalidatesTags: ["MemberPhoto"],
      /**
       * The profile carries `has_photo`, and the preview only asks for the image when that is
       * true. Refetching on a version counter alone left `has_photo` false on a first upload,
       * so the member saw "Photo updated." next to "No photo" until a full reload. Patching the
       * cached profile here is what makes the new photograph appear immediately.
       */
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(
            memberApi.util.updateQueryData("getMemberProfile", undefined, (draft) => {
              draft.has_photo = true;
            })
          );
        } catch {
          // A failed upload leaves the cached profile alone.
        }
      }
    }),

    deleteMemberPhoto: builder.mutation<{ success: boolean }, void>({
      query: () => ({ url: "/members/me/photo", method: "DELETE" }),
      transformResponse: (response: ApiEnvelope<{ success: boolean }>) => response.data,
      invalidatesTags: ["MemberPhoto"],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(
            memberApi.util.updateQueryData("getMemberProfile", undefined, (draft) => {
              draft.has_photo = false;
            })
          );
        } catch {
          // A failed removal leaves the cached profile alone.
        }
      }
    })
  })
});

export const {
  useMemberChangePasswordMutation,
  useGetMemberLookupsQuery,
  useGetMemberProfileQuery,
  useGetMemberPhotoBlobQuery,
  useSaveMemberProfileMutation,
  useSetMemberPhotoMutation,
  useDeleteMemberPhotoMutation
} = memberApi;
