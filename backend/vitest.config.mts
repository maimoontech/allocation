import { defineConfig } from "vitest/config";

// Tests live under src/__tests__ so they sit beside the code they cover and are
// compiled by the same tsconfig paths. They are excluded from `npm run build`
// via the "exclude" entry in tsconfig.json, so nothing under __tests__ reaches dist.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    restoreMocks: true,
    // The regression tests open a real MySQL pool and share one set of fixture rows, so
    // they must not run concurrently against the same database.
    fileParallelism: false,
    // Creates nothing; removes the fixture rows once, after every file has finished.
    // See src/__tests__/globalSetup.ts for why creation is per-file instead.
    globalSetup: ["src/__tests__/globalSetup.ts"],
    // Each file closes its own pool in afterAll, so give teardown room on a slow database.
    teardownTimeout: 20000
  }
});
