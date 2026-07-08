import { describe, expect, it } from "vitest";
import { cleanEnvVar } from "./config";

describe("cleanEnvVar", () => {
  it("passes through a clean value unchanged", () => {
    expect(cleanEnvVar("stepbylearn-bff6d.firebaseapp.com")).toBe(
      "stepbylearn-bff6d.firebaseapp.com",
    );
  });

  it("strips accidental wrapping double quotes", () => {
    expect(cleanEnvVar('"stepbylearn-bff6d.firebaseapp.com"')).toBe(
      "stepbylearn-bff6d.firebaseapp.com",
    );
  });

  it("strips accidental wrapping single quotes and surrounding whitespace", () => {
    expect(cleanEnvVar(" 'stepbylearn-bff6d.firebaseapp.com' ")).toBe(
      "stepbylearn-bff6d.firebaseapp.com",
    );
  });

  it("returns undefined unchanged", () => {
    expect(cleanEnvVar(undefined)).toBeUndefined();
  });

  it("returns undefined for an empty or whitespace-only value", () => {
    expect(cleanEnvVar("")).toBeUndefined();
    expect(cleanEnvVar("   ")).toBeUndefined();
  });
});
