import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Merged with the app's own Vite config rather than redeclared, so tests get the
// react plugin and the __APP_VERSION__ / __APP_BUILD__ defines. Redeclaring would
// leave those globals undefined and break any component that reads them.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      /**
       * `vmThreads` rather than the default `threads`.
       *
       * On the default pool this suite intermittently collapsed: every file, including ones
       * untouched for weeks, failing to collect with "Vitest failed to find the current
       * suite" pointing at the setup file. It is a worker dying, not a test — the same tree
       * would pass minutes later, and single files passed while the full run did not, which
       * makes it very easy to misread as a code problem. It cost most of a session on
       * 2026-11-12 before the pattern was clear.
       *
       * `vmThreads` reuses one jsdom per worker instead of building 18 of them (Vitest's own
       * hint, and ~50s of the run), and the suite has been stable on it. Per-file isolation
       * is unchanged. If a test ever needs something a VM context cannot give it, dropping
       * this line is the whole revert.
       */
      pool: "vmThreads",
      include: ["src/**/*.test.{ts,tsx}"],
      setupFiles: ["./src/test-setup.ts"],
      restoreMocks: true,
      env: {
        // The app's default base URL is the relative "/api/v1", which the browser resolves
        // against the page origin. Node cannot: `new Request("/api/v1/...")` throws
        // "Failed to parse URL", so a request fails before any fetch stub is consulted.
        // An absolute base in tests only sidesteps that, and changes nothing in the browser.
        VITE_API_BASE_URL: "http://localhost/api/v1"
      }
    }
  })
);
