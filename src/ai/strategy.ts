/**
 * The AI strategy interface (Strategy Pattern).
 *
 * Every provider implements this one small, transport-only contract. The prompt
 * building and JSON healing live outside it, so adding a provider means adding
 * one file, not touching the services.
 */

export interface AIStrategy {
  /** Send a prompt (with a system instruction) and return the raw text reply. */
  generateText(prompt: string, system: string): Promise<string>;
}

export class MissingApiKeyError extends Error {
  constructor() {
    super("No AI provider is configured. Add one in Settings.");
    this.name = "MissingApiKeyError";
  }
}
