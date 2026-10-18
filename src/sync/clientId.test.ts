import { describe, expect, it } from "vitest";
import { cleanEnvVar } from "./clientId";

describe("cleanEnvVar", () => {
  it("passes through a clean value unchanged", () => {
    expect(cleanEnvVar("123456789-abc.apps.googleusercontent.com")).toBe(
      "123456789-abc.apps.googleusercontent.com",
    );
  });

  it("strips accidental wrapping double quotes", () => {
    expect(cleanEnvVar('"123456789-abc.apps.googleusercontent.com"')).toBe(
      "123456789-abc.apps.googleusercontent.com",
    );
  });

  it("strips accidental wrapping single quotes and surrounding whitespace", () => {
    expect(cleanEnvVar(" '123456789-abc.apps.googleusercontent.com' ")).toBe(
      "123456789-abc.apps.googleusercontent.com",
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
