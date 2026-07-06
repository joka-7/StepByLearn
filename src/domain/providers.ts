/**
 * AI provider catalog (pure domain data).
 *
 * StepByLearn supports several interchangeable cloud providers behind one
 * Strategy interface. This module lists them and their sensible defaults so the
 * settings, AI, and UI layers all agree on the same set without depending on
 * each other. Every model field is user-editable in Settings — provider model
 * catalogs change over time, so `modelsUrl` gives the user a place to check the
 * current list rather than being stuck with a possibly-stale default.
 */

export type ProviderId = "anthropic" | "openai" | "groq" | "gemini";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** Default model id (editable by the user). */
  defaultModel: string;
  /** Placeholder shown in the API-key field. */
  keyPlaceholder: string;
  /** Where the user gets a key. */
  consoleUrl: string;
  /** Where the user can see the provider's current model catalog. */
  modelsUrl: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    defaultModel: "claude-opus-4-8",
    keyPlaceholder: "sk-ant-…",
    consoleUrl: "https://console.anthropic.com",
    modelsUrl: "https://docs.anthropic.com/en/docs/about-claude/models",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    keyPlaceholder: "sk-…",
    consoleUrl: "https://platform.openai.com/api-keys",
    modelsUrl: "https://platform.openai.com/docs/models",
  },
  groq: {
    id: "groq",
    label: "Groq",
    // llama-3.3-70b-versatile was deprecated by Groq on 2026-06-17; this is
    // their recommended replacement. Model availability changes on Groq more
    // often than other providers — check modelsUrl if generation starts
    // failing with a "model decommissioned" error.
    defaultModel: "openai/gpt-oss-120b",
    keyPlaceholder: "gsk_…",
    consoleUrl: "https://console.groq.com/keys",
    modelsUrl: "https://console.groq.com/docs/models",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    // "-latest" is a Google-maintained alias that is hot-swapped to their
    // current recommended Flash release (with advance notice), so this stays
    // valid without needing a hardcoded dated model id.
    defaultModel: "gemini-flash-latest",
    keyPlaceholder: "AIza…",
    consoleUrl: "https://aistudio.google.com/app/apikey",
    modelsUrl: "https://ai.google.dev/gemini-api/docs/models",
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

/** Default model id per provider, derived from {@link PROVIDERS}. */
export function defaultModels(): Record<ProviderId, string> {
  return {
    anthropic: PROVIDERS.anthropic.defaultModel,
    openai: PROVIDERS.openai.defaultModel,
    groq: PROVIDERS.groq.defaultModel,
    gemini: PROVIDERS.gemini.defaultModel,
  };
}
