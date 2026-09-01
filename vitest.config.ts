import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // e2e/ holds Playwright specs. Vitest collecting one throws
    // "Playwright Test did not expect test.describe() to be called here"
    // and fails the whole unit run.
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
  },
});
