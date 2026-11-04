import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAuth } from "../auth/authSlice";
import { memberApi } from "../member/memberApi";
import { makeTestStore } from "../../test-utils";
import type { AuthUser } from "../../types";

/**
 * The 401 refresh-and-retry interceptor (T113).
 *
 * The failure this prevents: the access token lasts a day, `POST /auth/refresh` existed on the
 * server but was never called from the UI, and filling in a twelve-tab profile is exactly the
 * session long enough to cross that boundary. Without the interceptor the save returns 401 and
 * the member's unsaved work is stranded behind a login screen.
 *
 * These tests drive the interceptor through a real RTK Query endpoint and a stubbed `fetch`,
 * because the behaviour under test is a sequence of requests — original, refresh, retry — and
 * the thing worth asserting is the sequence, not any one call.
 */

const USER: AuthUser = {
  id: 1,
  role: "member",
  displayName: "Test Member",
  memberId: 1,
  mustChangePassword: false
};

/** Each entry is one request the interceptor made, in order. */
type Call = { url: string; method: string; body: unknown };

let calls: Call[] = [];

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/**
 * Records every request and answers from a queue of handlers.
 *
 * `fetchBaseQuery` calls `fetch` with a single `Request`, so the method and body come off that
 * object rather than from an `init` argument.
 */
function stubFetch(handler: (call: Call, index: number) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const request = input instanceof Request ? input : null;
      const url = request ? request.url : String(input);
      const method = (request?.method ?? init?.method ?? "GET").toUpperCase();
      const body = request ? await request.clone().text() : (init?.body ?? null);

      const call: Call = {
        url,
        method,
        body: typeof body === "string" && body ? JSON.parse(body) : null
      };
      const index = calls.length;
      calls.push(call);
      return handler(call, index);
    })
  );
}

function storeWithSession(refreshToken: string) {
  const store = makeTestStore();
  store.dispatch(setAuth({ token: "expired-token", refreshToken, user: USER }));
  return store;
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("401 refresh and retry", () => {
  it("refreshes the token and replays the original request", async () => {
    stubFetch((call) => {
      if (call.url.includes("/auth/refresh")) {
        return jsonResponse(200, { success: true, data: { token: "fresh-token" } });
      }
      // 401 the first time, succeed once the token has been replaced.
      const alreadyRefreshed = calls.some((c) => c.url.includes("/auth/refresh"));
      if (!alreadyRefreshed) return jsonResponse(401, { success: false, message: "Unauthorized" });
      return jsonResponse(200, { success: true, data: { current_hijri_year: 1448 } });
    });

    const store = storeWithSession("a-refresh-token");
    const result = await store.dispatch(memberApi.endpoints.getMemberLookups.initiate());

    expect(result.data).toEqual({ current_hijri_year: 1448 });

    // Three requests, in this order: the original, the refresh, the replay.
    expect(calls).toHaveLength(3);
    expect(calls[0].url).toContain("/members/lookups");
    expect(calls[1].url).toContain("/auth/refresh");
    expect(calls[1].method).toBe("POST");
    expect(calls[1].body).toEqual({ refresh_token: "a-refresh-token" });
    expect(calls[2].url).toContain("/members/lookups");

    // The new token is in the slice, so later requests use it without another refresh.
    expect(store.getState().auth.token).toBe("fresh-token");
  });

  it("sends the refreshed token on the replayed request, not the expired one", async () => {
    const authHeaders: Array<string | null> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const request = input as Request;
        authHeaders.push(request.headers.get("authorization"));

        if (request.url.includes("/auth/refresh")) {
          return jsonResponse(200, { success: true, data: { token: "fresh-token" } });
        }
        if (authHeaders.filter((h) => h === "Bearer expired-token").length === 1) {
          return jsonResponse(401, { success: false, message: "Unauthorized" });
        }
        return jsonResponse(200, { success: true, data: { current_hijri_year: 1448 } });
      })
    );

    const store = storeWithSession("a-refresh-token");
    await store.dispatch(memberApi.endpoints.getMemberLookups.initiate());

    expect(authHeaders[0]).toBe("Bearer expired-token");
    expect(authHeaders[2]).toBe("Bearer fresh-token");
  });

  it("signs the member out when the refresh token is rejected", async () => {
    // What a member sees after their own password change revoked the refresh token (FR-022).
    stubFetch((call) => {
      if (call.url.includes("/auth/refresh")) {
        return jsonResponse(401, { success: false, message: "Invalid refresh token" });
      }
      return jsonResponse(401, { success: false, message: "Unauthorized" });
    });

    const store = storeWithSession("a-revoked-token");
    const result = await store.dispatch(memberApi.endpoints.getMemberLookups.initiate());

    expect(result.error).toBeTruthy();
    // Cleared, so ProtectedRoute sends them to the login page rather than silently re-granting.
    expect(store.getState().auth.token).toBeNull();
    expect(store.getState().auth.user).toBeNull();

    // No replay after a failed refresh.
    expect(calls.filter((c) => c.url.includes("/members/lookups"))).toHaveLength(1);
  });

  it("does not refresh a 401 from the login endpoint", async () => {
    // A wrong password is an answer, not an expired session. Retrying it would turn one failed
    // sign-in into two and could clear a session the member still had.
    stubFetch(() => jsonResponse(401, { success: false, message: "Invalid credentials" }));

    const store = makeTestStore();
    const { authApi } = await import("../auth/authApi");
    await store.dispatch(
      authApi.endpoints.login.initiate({
        identifier: "99900101",
        password: "wrong",
        role: "member"
      })
    );

    expect(calls).toHaveLength(1);
    expect(calls.every((c) => !c.url.includes("/auth/refresh"))).toBe(true);
  });

  it("refreshes once for several requests that fail together", async () => {
    // A profile page issues three requests at once. One expired token must produce one
    // refresh, not three — the first would succeed and the rest would present an
    // already-rotated token.
    stubFetch((call) => {
      if (call.url.includes("/auth/refresh")) {
        return jsonResponse(200, { success: true, data: { token: "fresh-token" } });
      }
      const refreshed = calls.some((c) => c.url.includes("/auth/refresh"));
      if (!refreshed) return jsonResponse(401, { success: false, message: "Unauthorized" });
      return jsonResponse(200, { success: true, data: { current_hijri_year: 1448 } });
    });

    const store = storeWithSession("a-refresh-token");
    await Promise.all([
      store.dispatch(memberApi.endpoints.getMemberLookups.initiate()),
      store.dispatch(memberApi.endpoints.getMemberProfile.initiate())
    ]);

    expect(calls.filter((c) => c.url.includes("/auth/refresh"))).toHaveLength(1);
  });

  it("leaves a successful request entirely alone", async () => {
    stubFetch(() => jsonResponse(200, { success: true, data: { current_hijri_year: 1448 } }));

    const store = storeWithSession("a-refresh-token");
    const result = await store.dispatch(memberApi.endpoints.getMemberLookups.initiate());

    expect(result.data).toEqual({ current_hijri_year: 1448 });
    expect(calls).toHaveLength(1);
    expect(store.getState().auth.token).toBe("expired-token");
  });

  it("does not retry a 403, which is not an expired session", async () => {
    // The forced-password-change refusal is a 403 and must reach the page, which redirects.
    stubFetch(() =>
      jsonResponse(403, { success: false, message: "You must change your password first." })
    );

    const store = storeWithSession("a-refresh-token");
    const result = await store.dispatch(memberApi.endpoints.getMemberProfile.initiate());

    expect(result.error).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(store.getState().auth.token).toBe("expired-token");
  });
});
