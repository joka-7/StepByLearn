/**
 * Strategy resolver: build the {@link AIStrategy} for the configured
 * provider fallback list at call time.
 *
 * Backed by modeldispatcher-browser-agent — the shared browser-native
 * AI core extracted from this file's former per-provider strategies (and
 * JobFlowTracker/KanDOne/HighFive, which had each independently built the
 * same thing). No vendor SDK, no server: the same direct-browser,
 * bring-your-own-key call this app always made. Unlike the single-provider
 * shape this app kept until 0.6.7, `config` here is the real multi-provider
 * fallback list — a candidate that's rate-limited or out of quota is skipped
 * for the next one automatically, the same as every other app using this
 * package.
 */

import { complete, isConfigReady, type AgentConfig } from "modeldispatcher-browser-agent";
import { MissingApiKeyError, type AIStrategy } from "./strategy";

/** Build the strategy for the configured fallback list, or throw if nothing
 * usable is configured. */
export function resolveStrategy(config: AgentConfig): AIStrategy {
  if (!isConfigReady(config)) throw new MissingApiKeyError();
  return {
    async generateText(prompt, system) {
      // jsonMode: true matches every former strategy's behaviour — Gemini's
      // responseMimeType and OpenAI/Groq's response_format both requested
      // JSON; Anthropic has no such mode (jsonMode is a no-op there), same
      // as before. The jsonHealer downstream remains the actual safety net
      // regardless of what a provider/model does or doesn't honour.
      return complete(config, prompt, { systemInstruction: system, jsonMode: true });
    },
  };
}
