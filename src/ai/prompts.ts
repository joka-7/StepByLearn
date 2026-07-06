/**
 * Prompt templates for syllabus generation.
 *
 * The JSON shape is embedded directly in the prompt so the contract stays
 * auditable and in lock-step with {@link SyllabusDraft}.
 */

import type { Difficulty } from "../domain/types";

export const SYSTEM_INSTRUCTION =
  "You are an expert curriculum designer. You produce concise, well-sequenced, " +
  "step-by-step learning paths. You ALWAYS respond with a single valid JSON " +
  "object and no surrounding prose, markdown, or code fences.";

const SCHEMA_HINT = `{
  "title": string,
  "topic": string,
  "description": string,
  "difficulty": "beginner" | "intermediate" | "advanced",
  "estimatedHours": number,
  "steps": [
    {
      "title": string,
      "content": string,
      "resources": [ { "label": string, "url": string } ],
      "estimatedMinutes": number
    }
  ]
}`;

/** Build the user prompt asking the model for a structured syllabus. */
export function buildSyllabusPrompt(topic: string, difficulty: Difficulty): string {
  return (
    `Create a step-by-step learning path for the topic: ${JSON.stringify(topic)}.\n` +
    `Target difficulty: ${difficulty}.\n\n` +
    "Requirements:\n" +
    "- Between 5 and 12 ordered steps, each with a clear title and a short " +
    "content description.\n" +
    "- Optionally include a few high-quality resources (label + URL) per step.\n" +
    "- Provide estimatedMinutes per step when reasonable.\n\n" +
    "Return ONLY a JSON object matching exactly this shape:\n" +
    SCHEMA_HINT +
    "\n"
  );
}
