import { PROVIDERS } from "modeldispatcher-browser-agent";
import { describe, expect, it } from "vitest";
import { buildCsp, InvalidCspSourceError, parseExtraConnectSources, PROVIDER_ORIGINS } from "./csp";

function directive(policy: string, name: string): string[] {
  const found = policy.split("; ").find((d) => d.startsWith(`${name} `));
  if (!found) throw new Error(`no ${name} directive`);
  return found.slice(name.length + 1).split(" ");
}

describe("buildCsp", () => {
  const policy = buildCsp();

  it("never allows inline or eval'd script, or a bare wildcard, anywhere", () => {
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|wasm-unsafe-eval/);
    for (const part of policy.split("; ")) {
      expect(part.split(" ")).not.toContain("*");
    }
  });

  it.each([
    ["script-src", ["'self'", "https://accounts.google.com/gsi/client"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'none'"]],
    ["form-action", ["'none'"]],
    ["frame-src", ["https://accounts.google.com/gsi/"]],
  ])("%s is exactly %j", (name, expected) => {
    expect(directive(policy, name)).toEqual(expected);
  });

  it("lets the page connect to every AI provider the package supports, Google sign-in and Drive, and itself", () => {
    const connect = directive(policy, "connect-src");
    for (const origins of Object.values(PROVIDER_ORIGINS)) {
      for (const origin of origins) expect(connect).toContain(origin);
    }
    expect(connect).toEqual(
      expect.arrayContaining([
        "'self'",
        "https://www.googleapis.com",
        "https://openidconnect.googleapis.com",
        "https://oauth2.googleapis.com",
        "https://accounts.google.com/gsi/",
      ]),
    );
  });

  it("covers exactly the providers modeldispatcher-browser-agent ships, so a new one can't be silently blocked", () => {
    expect(Object.keys(PROVIDER_ORIGINS).sort()).toEqual(Object.keys(PROVIDERS).sort());
  });

  it("allows only the third-party hosts the UI actually loads resources from", () => {
    expect(directive(policy, "img-src")).toEqual(["'self'", "data:", "https://img.youtube.com"]);
    expect(directive(policy, "font-src")).toEqual(["https://fonts.gstatic.com"]);
    expect(directive(policy, "style-src")).toEqual([
      "'self'",
      "https://fonts.googleapis.com",
      "https://accounts.google.com/gsi/style",
    ]);
  });

  it("adds extra connect origins to connect-src only", () => {
    const extended = buildCsp(["https://ollama.lan:11434"]);
    expect(directive(extended, "connect-src")).toContain("https://ollama.lan:11434");
    expect(directive(extended, "script-src")).toEqual(directive(policy, "script-src"));
  });
});

describe("parseExtraConnectSources", () => {
  it.each([
    ["undefined", undefined, []],
    ["an empty string", "", []],
    ["one origin", "https://ollama.lan:11434", ["https://ollama.lan:11434"]],
    [
      "space and comma separators",
      "https://a.example, http://b.example:8080  https://c.example",
      ["https://a.example", "http://b.example:8080", "https://c.example"],
    ],
  ])("accepts %s", (_name, raw, expected) => {
    expect(parseExtraConnectSources(raw)).toEqual(expected);
  });

  it.each([
    ["a wildcard", "*"],
    ["a wildcard host", "https://*.example.com"],
    ["a path", "https://a.example/v1"],
    ["a scheme-less host", "a.example"],
    ["a non-http scheme", "javascript:alert(1)"],
    ["a directive injection", "https://a.example;script-src https://evil.example"],
    ["a quote", "'unsafe-inline'"],
    ["a data: source", "data:"],
  ])("rejects %s", (_name, raw) => {
    expect(() => parseExtraConnectSources(raw)).toThrow(InvalidCspSourceError);
  });
});
