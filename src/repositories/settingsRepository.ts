/**
 * Repository for provider settings and the cloud API key.
 *
 * Security note: this is a pure browser app, so there is no OS keyring to lean
 * on. The Anthropic API key is kept in `localStorage` and never leaves the
 * browser except on the direct, user-initiated call to the Anthropic API. It is
 * stored apart from the Dexie data so it is never bundled into an exported path
 * or a settings document.
 */

import { db } from "../db/database";
import type { AppSettings } from "../domain/types";

const API_KEY_STORAGE = "stepbylearn.anthropicApiKey";
const DEFAULT_MODEL = "claude-opus-4-8";

const DEFAULT_SETTINGS: AppSettings = {
  id: "singleton",
  cloudModel: DEFAULT_MODEL,
};

/** Return current settings, materializing defaults on first access. */
export async function getSettings(): Promise<AppSettings> {
  return (await db.settings.get("singleton")) ?? DEFAULT_SETTINGS;
}

/** Persist provider preferences (never the key — see {@link setApiKey}). */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put({ ...settings, id: "singleton" });
}

/** Read the stored cloud API key, or null if none has been entered. */
export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE);
}

/** Store (or clear, when given an empty string) the cloud API key. */
export function setApiKey(key: string): void {
  if (key) localStorage.setItem(API_KEY_STORAGE, key);
  else localStorage.removeItem(API_KEY_STORAGE);
}

/** Whether a cloud API key is present (without exposing it). */
export function hasApiKey(): boolean {
  return Boolean(getApiKey());
}
