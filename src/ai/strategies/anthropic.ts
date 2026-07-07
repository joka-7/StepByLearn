/**
 * Anthropic (Claude) strategy — direct browser call via the official SDK.
 *
 * `dangerouslyAllowBrowser` makes the SDK send the
 * `anthropic-dangerous-direct-browser-access` header. Acceptable here because
 * the user supplies their own key on their own machine (no backend exists).
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AIStrategy } from "../strategy";

const MAX_TOKENS = 8192;

export function createAnthropicStrategy(apiKey: string, model: string): AIStrategy {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  return {
    async generateText(prompt, system) {
      const message = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content: prompt }],
      });
      return message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
    },
  };
}
