/**
 * Provider settings, backed by modeldispatcher-browser-agent's own
 * `AgentConfig` (a multi-provider fallback list) in localStorage — the same
 * convention JobFlowTracker/KanDOne/HighFive use, replacing this app's
 * former single-provider Dexie + per-provider-localStorage-key shape.
 */

import {
  isConfigReady,
  isKnownProvider,
  loadConfig,
  PROVIDERS,
  saveConfig,
  type AgentConfig,
} from "modeldispatcher-browser-agent";
import { db } from "../db/database";

const LEGACY_API_KEY_PREFIX = "stepbylearn.apiKey.";

function legacyApiKey(provider: string): string | null {
  return localStorage.getItem(LEGACY_API_KEY_PREFIX + provider);
}

/**
 * One-time migration from the pre-0.6.7 single-provider Dexie record (plus
 * its per-provider localStorage key) into the shared `AgentConfig`. Safe to
 * call on every app start: it's a no-op once a real config already exists,
 * the same "fall back to legacy, only until migrated" pattern every other
 * app that adopted this package uses.
 */
export async function migrateLegacySettings(): Promise<void> {
  if (loadConfig().providers.length > 0) return;

  const legacy = await db.settings.get("singleton");
  if (!legacy || !isKnownProvider(legacy.provider)) return;

  const key = legacyApiKey(legacy.provider);
  if (!key) return;

  const model = legacy.models?.[legacy.provider]?.trim() || PROVIDERS[legacy.provider].defaultModel;
  saveConfig({
    providers: [{ provider: legacy.provider, model, apiKeys: [key] }],
    ollamaUrl: "http://localhost:11434",
  });
}

export { loadConfig as loadAgentConfig, saveConfig, isConfigReady };
export type { AgentConfig };
