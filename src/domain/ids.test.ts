import { describe, expect, it } from "vitest";
import { newId } from "./ids";

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("newId", () => {
  it("produces a UUID-shaped string", () => {
    expect(newId()).toMatch(UUID_SHAPE);
  });

  it("sets the version nibble to 7 and a valid RFC 4122 variant nibble", () => {
    const id = newId();
    const [, , third, fourth] = id.split("-");
    expect(third[0]).toBe("7");
    expect(["8", "9", "a", "b"]).toContain(fourth[0]);
  });

  it("is unique across calls", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
  });

  it("encodes a timestamp close to the current time in the leading 48 bits", () => {
    const before = Date.now();
    const id = newId();
    const after = Date.now();

    const timestampHex = id.replace(/-/g, "").slice(0, 12);
    const encodedMs = parseInt(timestampHex, 16);

    expect(encodedMs).toBeGreaterThanOrEqual(before);
    expect(encodedMs).toBeLessThanOrEqual(after);
  });
});
