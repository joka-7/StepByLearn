import { defineConfig } from "vitest/config";

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
      // Floors just under the measured 23.5/24.6/14.2/22.5, to ratchet up.
      // Unlike KanDOne there is no functional e2e suite backing this up --
      // e2e/ holds only a screenshot capture that skips under CI -- so this
      // is the whole picture, and it is low. The gate exists to stop it
      // slipping further while the number is raised.
      thresholds: { lines: 21, statements: 22, functions: 12, branches: 20 },
    },
  },
});
