import { defineConfig, devices } from "@playwright/test";

// Browser E2E for Perpetua (Perpetua desktop). Drives the REAL backend:
// one webServer runs the headless Axum API (`perpetua serve`) against a throwaway
// vault, the other runs the SvelteKit dev server. Build the Rust binary first:
//   cd src-tauri && cargo build
const isWin = process.platform === "win32";
const SERVE = isWin
  ? "src-tauri\\target\\debug\\perpetua.exe serve .e2e-data"
  : "./src-tauri/target/debug/perpetua serve .e2e-data";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  // Vite dev compiles routes on first request, so cold loads can be slow.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: SERVE,
      url: "http://127.0.0.1:18765/api/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "npm run dev -- --port 4173 --strictPort --host 127.0.0.1",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
