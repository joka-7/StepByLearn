/**
 * Strategy resolver: pick the concrete provider driver at call time.
 *
 * This is the single switch that maps a provider id to its implementation, so
 * the services never import provider SDKs directly.
 */

import type { ProviderId } from "../domain/providers";
import { createAnthropicStrategy } from "./strategies/anthropic";
import { createGeminiStrategy } from "./strategies/gemini";
import { createGroqStrategy, createOpenAIStrategy } from "./strategies/openaiCompatible";
import { MissingApiKeyError, type AIStrategy } from "./strategy";

/** Build the strategy for a provider, or throw if no key is configured. */
export function resolveStrategy(provider: ProviderId, apiKey: string, model: string): AIStrategy {
  if (!apiKey) throw new MissingApiKeyError();
  switch (provider) {
    case "anthropic":
      return createAnthropicStrategy(apiKey, model);
    case "openai":
      return createOpenAIStrategy(apiKey, model);
    case "groq":
      return createGroqStrategy(apiKey, model);
    case "gemini":
      return createGeminiStrategy(apiKey, model);
    default:
      // Defends against a stale/corrupted provider id from persisted settings
      // that predates a newer provider list — fail with a clear message
      // instead of returning undefined and crashing the caller.
      throw new Error(`Unknown AI provider: ${String(provider)}`);
  }
}
