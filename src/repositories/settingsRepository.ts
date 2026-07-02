/**
 * Repository for provider settings and per-provider API keys.
 *
 * Security note: this is a pure browser app, so there is no OS keyring. Each
 * provider's API key is kept in `localStorage` (one entry per provider) and sent
 * only on the direct, user-initiated call to that provider's API. Keys are
 * stored apart from the Dexie data so they are never bundled into an exported
 * path or a settings document.
 */

import { db } from "../db/database";
import { PROVIDER_IDS, defaultModels, type ProviderId } from "../domain/providers";
import type { AppSettings } from "../domain/types";

const API_KEY_PREFIX = "stepbylearn.apiKey.";

const DEFAULT_SETTINGS: AppSettings = {
  id: "singleton",
  provider: "anthropic",
  models: defaultModels(),
};

/** Return current settings, materializing defaults on first access. */
export async function getSettings(): Promise<AppSettings> {
  const stored = await db.settings.get("singleton");
  if (!stored) return DEFAULT_SETTINGS;
  // Guard against a record saved by an older app version (e.g. the single-
  // provider shape `{id, cloudModel}`, which has no `provider` field): fall
  // back to the default provider rather than persisting `undefined`.
  const provider = PROVIDER_IDS.includes(stored.provider) ? stored.provider : DEFAULT_SETTINGS.provider;
  // Merge in any provider defaults added since the settings were first saved.
  return { id: "singleton", provider, models: { ...defaultModels(), ...stored.models } };
}

/** Persist provider preferences (never keys — see {@link setApiKey}). */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put({ ...settings, id: "singleton" });
}

/** Read a provider's stored API key, or null if none has been entered. */
export function getApiKey(provider: ProviderId): string | null {
  return localStorage.getItem(API_KEY_PREFIX + provider);
}

/** Store (or clear, when given an empty string) a provider's API key. */
export function setApiKey(provider: ProviderId, key: string): void {
  const storageKey = API_KEY_PREFIX + provider;
  if (key) localStorage.setItem(storageKey, key);
  else localStorage.removeItem(storageKey);
}

/** Whether a key is present for a provider (without exposing it). */
export function hasApiKey(provider: ProviderId): boolean {
  return Boolean(getApiKey(provider));
}
