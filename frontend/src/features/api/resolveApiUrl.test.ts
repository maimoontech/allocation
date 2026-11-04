import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveApiUrl } from "./api";

/**
 * `resolveApiUrl` builds the URL for the authenticated image fetches (the member's photograph
 * and the approval preview) and for the backup/import links.
 *
 * The original implementation appended a relative path to "/api/v1" WITHOUT a trailing slash,
 * so the last segment was treated as a file name: `new URL("members/me/photo", "/api/v1")`
 * drops "v1" and produces "/members/me/photo". In development that is a 404 from Vite, which is
 * why a member's photograph never appeared after uploading it.
 *
 * The file-level import runs with the absolute base from vitest.config.ts; the relative-base
 * case is loaded fresh after stubbing the env, since `apiBaseUrl` is computed at module load.
 */
describe("resolveApiUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("appends a relative path to a root-relative API base", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "/api/v1");
    const { resolveApiUrl: relative } = await import("./api");

    expect(relative("members/me/photo")).toBe(
      `${window.location.origin}/api/v1/members/me/photo`
    );
    expect(relative("member-photo-approvals/7/image")).toBe(
      `${window.location.origin}/api/v1/member-photo-approvals/7/image`
    );
  });

  it("appends a relative path to an absolute API base", () => {
    expect(resolveApiUrl("members/me/photo")).toBe(
      "http://localhost/api/v1/members/me/photo"
    );
  });

  it("leaves an already-rooted API path rooted", () => {
    expect(resolveApiUrl("/api/v1/import-export/database-backup")).toBe(
      "http://localhost/api/v1/import-export/database-backup"
    );
  });

  it("passes an absolute URL through untouched", () => {
    expect(resolveApiUrl("https://example.com/image.png")).toBe("https://example.com/image.png");
  });
});
