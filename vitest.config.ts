import { defineConfig } from "vitest/config";

// Pin a timezone ahead of UTC so date code that mixes UTC timestamps with
// local calendar days fails here instead of only for users east of UTC.
process.env.TZ = "Asia/Jerusalem";

export default defineConfig({
  test: {
    environment: "node",
    // e2e/ holds Playwright specs. Vitest collecting one throws
    // "Playwright Test did not expect test.describe() to be called here"
    // and fails the whole unit run.
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    coverage: {
      provider: "istanbul",
      reporter: ["text-summary", "lcov"],
      include: ["src/**"],
      exclude: ["src/**/*.test.*", "src/main.tsx"],
      // Floors just under the measured 46.7/46.5/34.9/47.7, to ratchet up. There
      // is still no functional e2e suite -- e2e/ holds only a screenshot
      // capture that skips under CI -- and no component tests, so UI code is
      // the uncovered bulk.
      thresholds: { lines: 44, statements: 44, functions: 32, branches: 45 },
    },
  },
});
