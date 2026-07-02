/**
 * AI provider catalog (pure domain data).
 *
 * StepByLearn supports several interchangeable cloud providers behind one
 * Strategy interface. This module lists them and their sensible defaults so the
 * settings, AI, and UI layers all agree on the same set without depending on
 * each other. Every model field is user-editable in Settings.
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
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    defaultModel: "claude-opus-4-8",
    keyPlaceholder: "sk-ant-…",
    consoleUrl: "https://console.anthropic.com",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    keyPlaceholder: "sk-…",
    consoleUrl: "https://platform.openai.com/api-keys",
  },
  groq: {
    id: "groq",
    label: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    keyPlaceholder: "gsk_…",
    consoleUrl: "https://console.groq.com/keys",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    defaultModel: "gemini-1.5-flash",
    keyPlaceholder: "AIza…",
    consoleUrl: "https://aistudio.google.com/app/apikey",
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
