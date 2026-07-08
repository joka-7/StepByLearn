/**
 * OpenAI and Groq strategies.
 *
 * Groq exposes an OpenAI-compatible endpoint, so both providers share the
 * official `openai` SDK — Groq just overrides the base URL. `response_format`
 * JSON mode is requested to improve reliability; the JSON healer remains the
 * safety net for any model that ignores it.
 */

import OpenAI from "openai";
import type { AIStrategy } from "../strategy";

const MAX_TOKENS = 8192;
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

function createStrategy(apiKey: string, model: string, baseURL?: string): AIStrategy {
  const client = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: true });
  return {
    async generateText(prompt, system) {
      const completion = await client.chat.completions.create({
        model,
        max_tokens: MAX_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      });
      return completion.choices[0]?.message?.content ?? "";
    },
  };
}

/** OpenAI (api.openai.com). */
export function createOpenAIStrategy(apiKey: string, model: string): AIStrategy {
  return createStrategy(apiKey, model);
}

/** Groq (OpenAI-compatible endpoint). */
export function createGroqStrategy(apiKey: string, model: string): AIStrategy {
  return createStrategy(apiKey, model, GROQ_BASE_URL);
}
