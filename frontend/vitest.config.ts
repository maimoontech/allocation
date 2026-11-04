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
