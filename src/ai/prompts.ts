/**
 * Prompt templates for syllabus generation.
 *
 * The JSON shape is embedded directly in the prompt so the contract stays
 * auditable and in lock-step with {@link SyllabusDraft}.
 */

import type { ContentType, Difficulty } from "../domain/types";

export const SYSTEM_INSTRUCTION =
  "You are an elite instructional designer who curates step-by-step learning " +
  "paths from REAL material that already exists on the web, rather than " +
  "writing new content yourself. For every step you pick one primary resource " +
  "(matching the step's format: a specific YouTube video for 'video', a named " +
  "podcast episode for 'podcast', or a specific article/doc page for 'text') " +
  "plus 1-2 supplementary resources. A 'video' entry's url MUST be a direct " +
  "link to one specific video on a known video platform (e.g. a youtube.com " +
  "/watch or youtu.be link) — never a channel page, playlist, or an article " +
  "that merely embeds or discusses a video; if you cannot pick a specific " +
  "video you are confident is real, use 'text' or 'podcast' instead. Prefer " +
  "well-known, stable, canonical sources — official documentation, " +
  "Wikipedia, MDN, established YouTube channels, major publications — over " +
  "obscure ones, since a link that doesn't resolve is worse than no link. " +
  "You ALWAYS respond with a single valid JSON object and no surrounding " +
  "prose, markdown, or code fences.";

const SCHEMA_HINT = `{
  "title": string,
  "topic": string,
  "description": string,
  "difficulty": "beginner" | "intermediate" | "advanced",
  "estimatedHours": number,
  "steps": [
    {
      "title": string,
      "duration": string (e.g. "45 minutes"),
      "type": "video" | "podcast" | "text",
      "description": string,
      "keyConcepts": [ string ],
      "materialTitle": string (title of the primary resource),
      "materialUrl": string (a real, specific URL to that resource),
      "resources": [
        { "title": string, "type": "video" | "podcast" | "text", "description": string, "duration": string, "url": string }
      ]
    }
  ]
}`;

export interface SyllabusPromptOptions {
  /** Target time per step, e.g. "45 minutes". */
  stepDuration: string;
  /** Preferred content format, or "all" to let the model choose per step. */
  contentType: ContentType | "all";
  /** The learner's self-described background; empty string if unspecified. */
  currentKnowledge: string;
}

const STEPS_ONLY_SCHEMA_HINT = `{
  "steps": [
    {
      "title": string,
      "duration": string (e.g. "45 minutes"),
      "type": "video" | "podcast" | "text",
      "description": string,
      "keyConcepts": [ string ],
      "materialTitle": string (title of the primary resource),
      "materialUrl": string (a real, specific URL to that resource),
      "resources": [
        { "title": string, "type": "video" | "podcast" | "text", "description": string, "duration": string, "url": string }
      ]
    }
  ]
}`;

/** Build the prompt asking the model to draft additional steps for an existing path. */
export function buildAdditionalStepsPrompt(
  courseTitle: string,
  topic: string,
  existingStepTitles: string[],
  instruction: string,
  options: SyllabusPromptOptions,
): string {
  const { stepDuration, contentType } = options;
  return (
    `You are extending an existing step-by-step learning path titled ${JSON.stringify(courseTitle)} ` +
    `(topic: ${JSON.stringify(topic)}).\n` +
    "The course already has these steps, in order:\n" +
    existingStepTitles.map((t, i) => `${i + 1}. ${t}`).join("\n") +
    "\n\n" +
    `Add new step(s) per this request from the learner: ${JSON.stringify(
      instruction || "Continue the course with the next logical steps.",
    )}\n` +
    `Each step should target roughly: ${stepDuration}.\n` +
    `Preferred content format(s): ${contentType}.\n\n` +
    "Requirements:\n" +
    "- Return between 1 and 5 new steps that continue naturally after the existing ones — do " +
    "not repeat any existing step.\n" +
    "- Each step needs a clear title, a short description, 2-3 keyConcepts, a primary resource " +
    "(materialTitle + a real materialUrl matching the step's type), and 1-2 supplementary " +
    "resources (each with its own url).\n" +
    "- Only link to real, well-known, stable sources you are confident exist (official docs, " +
    "Wikipedia, MDN, established publishers/channels). Do not invent a plausible-looking URL for " +
    "a page you are not confident is real.\n" +
    "- Any 'video' type must link to one specific video (a youtube.com/watch or youtu.be URL, " +
    "or another known video platform) — not a channel, playlist, or an article about a video.\n\n" +
    "Return ONLY a JSON object matching exactly this shape:\n" +
    STEPS_ONLY_SCHEMA_HINT +
    "\n"
  );
}

/** Build the user prompt asking the model for a structured syllabus. */
export function buildSyllabusPrompt(
  topic: string,
  difficulty: Difficulty,
  options: SyllabusPromptOptions,
): string {
  const { stepDuration, contentType, currentKnowledge } = options;
  return (
    `Create a step-by-step learning path for the topic: ${JSON.stringify(topic)}.\n` +
    `Target difficulty: ${difficulty}.\n` +
    `Each step should target roughly: ${stepDuration}.\n` +
    `Preferred content format(s): ${contentType}.\n` +
    `Learner's current knowledge / background: ${currentKnowledge || "Beginner level, no specific background."}\n\n` +
    "Requirements:\n" +
    "- Between 4 and 8 ordered steps, each logically building on the last.\n" +
    "- Each step needs a clear title, a short description, 2-3 keyConcepts, a " +
    "primary resource (materialTitle + a real materialUrl matching the step's " +
    "type), and 1-2 supplementary resources (each with its own url).\n" +
    "- Choose each step's 'type' to match the preferred content format(s) above " +
    "when it says 'all', vary sensibly between video/podcast/text.\n" +
    "- Only link to real, well-known, stable sources you are confident exist " +
    "(official docs, Wikipedia, MDN, established publishers/channels). Do not " +
    "invent a plausible-looking URL for a page you are not confident is real.\n" +
    "- Any 'video' type must link to one specific video (a youtube.com/watch or youtu.be URL, " +
    "or another known video platform) — not a channel, playlist, or an article about a video.\n\n" +
    "Return ONLY a JSON object matching exactly this shape:\n" +
    SCHEMA_HINT +
    "\n"
  );
}
