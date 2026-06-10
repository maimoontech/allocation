import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { RootState } from "../../store";

const defaultApiBaseUrl = import.meta.env.DEV ? "/api/v1" : "https://allocation-msl6.onrender.com/api/v1";
export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || defaultApiBaseUrl;
const apiRootUrl = apiBaseUrl.replace(/\/api\/v1\/?$/i, "");

export function resolveApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  if (/^https?:\/\//i.test(apiBaseUrl)) return new URL(path, `${apiBaseUrl.replace(/\/$/, "")}/`).toString();
  const origin = window.location.origin;
  const base = new URL(apiBaseUrl.startsWith("/") ? apiBaseUrl : `/${apiBaseUrl}`, origin);
  return new URL(path, base).toString();
}

export function resolveBackendUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  if (/^https?:\/\//i.test(apiRootUrl || apiBaseUrl)) {
    return new URL(path, `${(apiRootUrl || apiBaseUrl).replace(/\/$/, "")}/`).toString();
  }
  const origin = window.location.origin;
  const basePath = (apiRootUrl || apiBaseUrl).startsWith("/") ? (apiRootUrl || apiBaseUrl) : `/${apiRootUrl || apiBaseUrl}`;
  const base = new URL(basePath, origin);
  return new URL(path, base).toString();
}

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: apiBaseUrl,
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.token;
      if (token) headers.set("authorization", `Bearer ${token}`);
      return headers;
    },
    responseHandler: async (response) => {
      const text = await response.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        const head = text.replace(/\s+/g, " ").trim().slice(0, 200);
        throw new Error(
          `Invalid JSON response. This usually means the API base URL/proxy is wrong or the backend is down. Response starts with: ${head}`
        );
      }
    }
  }),
  tagTypes: ["Zones", "Mohallahs", "Parties", "Venues", "Miqaats", "Schedules", "Reports", "Ratings"],
  endpoints: () => ({})
});
