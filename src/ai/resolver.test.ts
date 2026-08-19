import { afterEach, describe, expect, it, vi } from "vitest";

import * as browserAgent from "@joka-7/modeldispatcher-browser-agent";
import { resolveStrategy } from "./resolver";
import { MissingApiKeyError } from "./strategy";

describe("resolveStrategy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
    const spy = vi.spyOn(browserAgent, "complete").mockResolvedValue('{"ok":true}');

    const strategy = resolveStrategy("openai", "sk-x", "gpt-4o-mini");
    const text = await strategy.generateText("write json", "be terse");

    expect(text).toBe('{"ok":true}');
    expect(spy).toHaveBeenCalledWith(
      { provider: "openai", apiKey: "sk-x", model: "gpt-4o-mini", ollamaUrl: "" },
      "write json",
      { systemInstruction: "be terse", jsonMode: true },
    );
  });

  it("still resolves an Anthropic strategy (jsonMode is a no-op there, matching prior behaviour)", async () => {
    vi.spyOn(browserAgent, "complete").mockResolvedValue("plain text");
    const strategy = resolveStrategy("anthropic", "sk-ant-x", "claude-opus-4-8");
    await expect(strategy.generateText("hi", "sys")).resolves.toBe("plain text");
  });
});
