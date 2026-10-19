import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // The dev server for the functional tests; the production build, served by
  // `vite preview`, for the Content-Security-Policy tests (the policy is only
  // injected into production HTML). `npm run test:e2e` builds first.
  webServer: [
    {
      command: "npm run dev -- --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run preview -- --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
