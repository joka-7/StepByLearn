import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveStrategy } from "./resolver";
import { MissingApiKeyError } from "./strategy";

// @joka-7/modeldispatcher-browser-agent ships as native ESM (package.json
// "type": "module", built by plain tsc — no bundler). A real ESM module's
// namespace object is a non-configurable exotic object per spec, so
// `vi.spyOn(namespaceImport, "complete")` throws ("Cannot redefine
// property") once the real published package is installed — it only
// appeared to work against a local-path install because Vitest's dep
// pre-bundling handled that differently. `vi.mock` replaces the module at
// import time instead, which works regardless of how the real module is
// shaped.
const { mockComplete } = vi.hoisted(() => ({ mockComplete: vi.fn() }));
vi.mock("@joka-7/modeldispatcher-browser-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@joka-7/modeldispatcher-browser-agent")>();
  return { ...actual, complete: mockComplete };
});

describe("resolveStrategy", () => {
  beforeEach(() => {
    mockComplete.mockReset();
  });

  it("throws MissingApiKeyError when no key is supplied", () => {
    expect(() => resolveStrategy("anthropic", "", "claude-x")).toThrow(MissingApiKeyError);
  });

  it("throws a clear error for an unrecognised provider id (stale persisted settings)", () => {
    // Cast past the ProviderId union — this defends against exactly the case
    // where TypeScript can't catch it: corrupted/stale data from storage.
    expect(() => resolveStrategy("cohere" as never, "key", "model")).toThrow(/Unknown AI provider/);
  });

  it("generateText delegates to the shared package with jsonMode always on", async () => {
    mockComplete.mockResolvedValue('{"ok":true}');

    const strategy = resolveStrategy("openai", "sk-x", "gpt-4o-mini");
    const text = await strategy.generateText("write json", "be terse");

    expect(text).toBe('{"ok":true}');
    expect(mockComplete).toHaveBeenCalledWith(
      { provider: "openai", apiKey: "sk-x", model: "gpt-4o-mini", ollamaUrl: "" },
      "write json",
      { systemInstruction: "be terse", jsonMode: true },
    );
  });

  it("still resolves an Anthropic strategy (jsonMode is a no-op there, matching prior behaviour)", async () => {
    mockComplete.mockResolvedValue("plain text");
    const strategy = resolveStrategy("anthropic", "sk-ant-x", "claude-opus-4-8");
    await expect(strategy.generateText("hi", "sys")).resolves.toBe("plain text");
  });
});
