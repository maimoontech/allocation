import fs from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const devApiTarget = "http://localhost:4000";
const frontendPackage = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version?: string };
const appVersion = frontendPackage.version ?? "0.0.0";
const appBuild =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_REF ||
  process.env.COMMIT_SHA ||
  "local";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD__: JSON.stringify(appBuild)
  },
  server: {
    proxy: {
      "/api": {
        target: devApiTarget,
        changeOrigin: true
      }
    }
  }
});
