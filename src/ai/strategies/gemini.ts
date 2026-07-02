/**
 * Google Gemini strategy — direct browser call via `@google/generative-ai`.
 *
 * `responseMimeType: "application/json"` asks Gemini for pure JSON; the healer
 * still runs as a safety net. The system instruction is passed via the model's
 * dedicated `systemInstruction` field rather than as a chat turn.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIStrategy } from "../strategy";

export function createGeminiStrategy(apiKey: string, model: string): AIStrategy {
  const client = new GoogleGenerativeAI(apiKey);
  return {
    async generateText(prompt, system) {
      const generativeModel = client.getGenerativeModel({
        model,
        systemInstruction: system,
        generationConfig: { responseMimeType: "application/json" },
      });
      const result = await generativeModel.generateContent(prompt);
      return result.response.text();
    },
  };
}
