/**
 * Strategy resolver: build the {@link AIStrategy} for a provider at call time.
 *
 * Backed by modeldispatcher-browser-agent — the shared browser-native
 * AI core extracted from this file's former per-provider strategies (and
 * JobFlowTracker/KanDOne/HighFive, which had each independently built the
 * same thing). No vendor SDK, no server: the same direct-browser,
 * bring-your-own-key call this app always made, just via one shared
 * implementation instead of three duplicated ones.
 */

import { complete } from "modeldispatcher-browser-agent";
import type { ProviderId } from "../domain/providers";
import { PROVIDERS } from "../domain/providers";
import { MissingApiKeyError, type AIStrategy } from "./strategy";

/** Build the strategy for a provider, or throw if no key is configured. */
export function resolveStrategy(provider: ProviderId, apiKey: string, model: string): AIStrategy {
  if (!apiKey) throw new MissingApiKeyError();
  // Defends against a stale/corrupted provider id from persisted settings
  // that predates a newer/removed provider — fail with a clear message
  // instead of letting an unrecognised id reach the shared package.
  if (!Object.hasOwn(PROVIDERS, provider)) {
    throw new Error(`Unknown AI provider: ${String(provider)}`);
  }
  return {
    async generateText(prompt, system) {
      // jsonMode: true matches every former strategy's behaviour — Gemini's
      // responseMimeType and OpenAI/Groq's response_format both requested
      // JSON; Anthropic has no such mode (jsonMode is a no-op there), same
      // as before. The jsonHealer downstream remains the actual safety net
      // regardless of what a provider/model does or doesn't honour.
      return complete(
        { providers: [{ provider, model, apiKeys: apiKey ? [apiKey] : [] }], ollamaUrl: "" },
        prompt,
        { systemInstruction: system, jsonMode: true },
      );
    },
  };
}
