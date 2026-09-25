import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "modeldispatcher-browser-agent";

import { resolveStrategy } from "./resolver";
import { MissingApiKeyError } from "./strategy";

// modeldispatcher-browser-agent ships as native ESM (package.json
// "type": "module", built by plain tsc — no bundler). A real ESM module's
// namespace object is a non-configurable exotic object per spec, so
// `vi.spyOn(namespaceImport, "complete")` throws ("Cannot redefine
// property") once the real published package is installed — it only
// appeared to work against a local-path install because Vitest's dep
// pre-bundling handled that differently. `vi.mock` replaces the module at
// import time instead, which works regardless of how the real module is
// shaped.
const { mockComplete } = vi.hoisted(() => ({ mockComplete: vi.fn() }));
vi.mock("modeldispatcher-browser-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("modeldispatcher-browser-agent")>();
  return { ...actual, complete: mockComplete };
});

const EMPTY_CONFIG: AgentConfig = { providers: [], ollamaUrl: "" };

describe("resolveStrategy", () => {
  beforeEach(() => {
    mockComplete.mockReset();
  });

  it("throws MissingApiKeyError when no provider is configured", () => {
    expect(() => resolveStrategy(EMPTY_CONFIG)).toThrow(MissingApiKeyError);
  });

  it("throws MissingApiKeyError when a provider is configured with no key", () => {
    const config: AgentConfig = {
      providers: [{ provider: "anthropic", model: "claude-x", apiKeys: [] }],
      ollamaUrl: "",
    };
    expect(() => resolveStrategy(config)).toThrow(MissingApiKeyError);
  });

  it("generateText delegates to the shared package with the full config and jsonMode always on", async () => {
    mockComplete.mockResolvedValue('{"ok":true}');
    const config: AgentConfig = {
      providers: [{ provider: "openai", model: "gpt-4o-mini", apiKeys: ["sk-x"] }],
      ollamaUrl: "",
    };

    const strategy = resolveStrategy(config);
    const text = await strategy.generateText("write json", "be terse");

    expect(text).toBe('{"ok":true}');
    expect(mockComplete).toHaveBeenCalledWith(config, "write json", {
      systemInstruction: "be terse",
      jsonMode: true,
    });
  });

  it("still resolves an Anthropic strategy (jsonMode is a no-op there, matching prior behaviour)", async () => {
    mockComplete.mockResolvedValue("plain text");
    const config: AgentConfig = {
      providers: [{ provider: "anthropic", model: "claude-opus-4-8", apiKeys: ["sk-ant-x"] }],
      ollamaUrl: "",
    };
    const strategy = resolveStrategy(config);
    await expect(strategy.generateText("hi", "sys")).resolves.toBe("plain text");
  });

  it("passes the whole multi-provider fallback list through, not just the first candidate", async () => {
    mockComplete.mockResolvedValue("fell back to groq");
    const config: AgentConfig = {
      providers: [
        { provider: "anthropic", model: "claude-opus-4-8", apiKeys: [] },
        { provider: "groq", model: "openai/gpt-oss-120b", apiKeys: ["gsk_x"] },
      ],
      ollamaUrl: "",
    };

    const strategy = resolveStrategy(config);
    await expect(strategy.generateText("hi", "sys")).resolves.toBe("fell back to groq");
    expect(mockComplete).toHaveBeenCalledWith(config, "hi", {
      systemInstruction: "sys",
      jsonMode: true,
    });
  });
});
