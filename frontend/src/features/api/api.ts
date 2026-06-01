import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { RootState } from "../../store";

const defaultApiBaseUrl = "https://allocation-msl6.onrender.com/api/v1";
export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || defaultApiBaseUrl;

export function resolveApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path, `${apiBaseUrl}/`).toString();
}

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: apiBaseUrl,
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.token;
      if (token) headers.set("authorization", `Bearer ${token}`);
      return headers;
    }
  }),
  tagTypes: ["Zones", "Mohallahs", "Parties", "Venues", "Miqaats", "Schedules", "Reports", "Ratings"],
  endpoints: () => ({})
});
