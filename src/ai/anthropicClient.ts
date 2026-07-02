/**
 * Cloud AI driver: calls the Anthropic Claude API directly from the browser.
 *
 * The user's API key is passed in per call (read from local storage by the
 * service layer) and used with `dangerouslyAllowBrowser`, which makes the SDK
 * send the `anthropic-dangerous-direct-browser-access` header. This keeps the
 * app fully static — no backend proxy — at the cost of exposing the key to the
 * page, which is acceptable for a single-user, local-first tool where the user
 * supplies their own key.
 */

import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_INSTRUCTION, buildSyllabusPrompt } from "./prompts";
import type { Difficulty } from "../domain/types";

const MAX_TOKENS = 4096;

export class MissingApiKeyError extends Error {
  constructor() {
    super("No Anthropic API key is set. Add one in Settings to generate paths.");
    this.name = "MissingApiKeyError";
  }
}

/**
 * Ask the model for a syllabus and return its raw text response.
 *
 * The raw text is intentionally returned unparsed — the JSON healer owns
 * turning it into a validated domain model, keeping this driver a thin transport
 * that any parser can sit behind.
 */
export async function generateSyllabusText(
  apiKey: string,
  model: string,
  topic: string,
  difficulty: Difficulty,
): Promise<string> {
  if (!apiKey) throw new MissingApiKeyError();

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const message = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_INSTRUCTION,
    messages: [{ role: "user", content: buildSyllabusPrompt(topic, difficulty) }],
  });

  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}
