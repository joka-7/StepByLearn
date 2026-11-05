import { describe, expect, it } from "vitest";
import { toSafeUrl } from "./urls";

describe("toSafeUrl", () => {
  it.each([
    [
      "an https URL",
      "https://developer.mozilla.org/en-US/",
      "https://developer.mozilla.org/en-US/",
    ],
    ["an http URL, trimmed", "  http://example.com/a  ", "http://example.com/a"],
    ["a javascript: URL", "javascript:alert(1)", ""],
    ["a mixed-case javascript: URL", " JaVaScRiPt:alert(1)", ""],
    ["a data: URL", "data:text/html,<script>alert(1)</script>", ""],
    ["a relative path", "/watch?v=1", ""],
    ["an empty string", "", ""],
    ["a non-string", 42, ""],
  ])("handles %s", (_name, input, expected) => {
    expect(toSafeUrl(input)).toBe(expected);
  });
});
