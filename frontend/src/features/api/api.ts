import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { clearAuth, setToken } from "../auth/authSlice";
import type { RootState } from "../../store";

const defaultApiBaseUrl = import.meta.env.DEV ? "/api/v1" : "https://allocation-msl6.onrender.com/api/v1";
export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || defaultApiBaseUrl;
const apiRootUrl = apiBaseUrl.replace(/\/api\/v1\/?$/i, "");

export function resolveApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  // The base must end with a slash. `new URL("members/me/photo", "http://host/api/v1")` treats
  // "v1" as a file name and drops it, which silently turned the photo requests into
  // "/members/me/photo" and answered 404 from Vite. Root-absolute paths such as
  // "/api/v1/import-export/..." still resolve against the API origin, as before.
  if (/^https?:\/\//i.test(apiBaseUrl)) {
    return new URL(path, `${apiBaseUrl.replace(/\/$/, "")}/`).toString();
  }
  const origin = window.location.origin;
  const base = new URL(
    `${apiBaseUrl.startsWith("/") ? apiBaseUrl : `/${apiBaseUrl}`}`.replace(/\/?$/, "/"),
    origin
  );
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

const rawBaseQuery = fetchBaseQuery({
    baseUrl: apiBaseUrl,
    // Resolved from globalThis on every call instead of captured once when this module is
    // first imported. Without the indirection, `fetchBaseQuery` holds whatever `fetch` was
    // at import time, so anything that replaces it afterwards — a test harness, a polyfill
    // loaded late — is silently ignored. Behaviour in the browser is identical.
    fetchFn: (...args) => globalThis.fetch(...args),
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
});

/** The request path, however the caller expressed it. */
function urlOf(args: string | FetchArgs): string {
  return typeof args === "string" ? args : args.url;
}

/**
 * Paths that must never trigger a refresh-and-retry.
 *
 * `/auth/refresh` would recurse. `/auth/login` returns 401 for a wrong password, which is an
 * answer, not an expired session — retrying it would turn a failed sign-in into a second
 * failed sign-in and could clear a session the member still had.
 */
const NO_RETRY = ["/auth/refresh", "/auth/login", "/auth/logout"];

/**
 * One refresh at a time.
 *
 * A profile page issues several requests at once, so an expired token produces several 401s
 * within milliseconds. Without this, each would start its own refresh; the first would
 * succeed and the rest would present an already-rotated refresh token. They share the first
 * one's promise instead.
 */
let inFlightRefresh: Promise<string | null> | null = null;

async function refreshAccessToken(
  apiArgs: Parameters<BaseQueryFn>[1],
  extraOptions: Record<string, unknown>,
  refreshToken: string
): Promise<string | null> {
  const result = await rawBaseQuery(
    { url: "/auth/refresh", method: "POST", body: { refresh_token: refreshToken } },
    apiArgs,
    extraOptions
  );
  const token = (result.data as { data?: { token?: string } } | undefined)?.data?.token;
  return typeof token === "string" && token ? token : null;
}

/**
 * Refresh-on-401, then retry once.
 *
 * Why this exists: the access token lasts a day and `POST /auth/refresh` was already
 * implemented on the server but never called from the UI. Filling in a twelve-tab profile is
 * exactly the session long enough to cross that boundary, and the failure mode without this
 * is the worst kind — the save returns 401 and the member's unsaved work is stranded behind a
 * login screen. (The draft is mirrored to sessionStorage, so it is recoverable, but the
 * member has no way to know that.)
 *
 * On a refresh failure the session is cleared, which sends `ProtectedRoute` to the login
 * page. That is the right outcome for a member whose refresh token was revoked by their own
 * password change (FR-022): the old session is genuinely over, and a silent re-grant would
 * defeat the point of invalidating it.
 */
const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, apiArgs, extraOptions) => {
  let result = await rawBaseQuery(args, apiArgs, extraOptions);

  if (result.error?.status !== 401) return result;
  if (NO_RETRY.some((path) => urlOf(args).startsWith(path))) return result;

  const refreshToken = (apiArgs.getState() as RootState).auth.refreshToken;
  if (!refreshToken) {
    // Nothing to refresh with — e.g. a token restored from storage without its pair.
    apiArgs.dispatch(clearAuth());
    return result;
  }

  if (!inFlightRefresh) {
    inFlightRefresh = refreshAccessToken(apiArgs, extraOptions, refreshToken).finally(() => {
      inFlightRefresh = null;
    });
  }
  const token = await inFlightRefresh;

  if (!token) {
    apiArgs.dispatch(clearAuth());
    return result;
  }

  apiArgs.dispatch(setToken(token));
  // The retry reads the new token through prepareHeaders, so nothing is passed along here.
  result = await rawBaseQuery(args, apiArgs, extraOptions);
  return result;
};

export const api = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["Zones", "Mohallahs", "Parties", "Venues", "Miqaats", "Schedules", "Reports", "Ratings", "Members", "MemberLookups", "MemberPhoto", "MemberProfileAdmin", "HelpChats", "HelpTopics", "PartyMembers"],
  endpoints: () => ({})
});
