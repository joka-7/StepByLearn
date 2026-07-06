/**
 * Coerce fragile LLM output into a validated {@link SyllabusDraft}.
 *
 * Even a capable cloud model can wrap JSON in prose or code fences. This applies
 * a defense-in-depth pipeline:
 *   1. Strip markdown code fences and leading prose.
 *   2. Extract the first balanced `{...}` span with a string-aware bracket scan
 *      (so braces inside string values do not confuse it).
 *   3. Parse, then validate/normalize into the domain shape.
 *
 * It never throws on structural quirks it can recover from; it throws a clear
 * error only when the output truly cannot become a valid syllabus.
 */

import type {
  Difficulty,
  StepResource,
  SyllabusDraft,
  SyllabusStepDraft,
} from "../domain/types";

const DIFFICULTIES: readonly Difficulty[] = ["beginner", "intermediate", "advanced"];

export class JsonHealingError extends Error {
  constructor(
    message: string,
    readonly rawOutput: string,
  ) {
    super(message);
    this.name = "JsonHealingError";
  }
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const lines = trimmed.split("\n");
  if (lines[0].startsWith("```")) lines.shift();
  if (lines.length && lines[lines.length - 1].trim().startsWith("```")) lines.pop();
  return lines.join("\n").trim();
}

/**
 * Extract the first balanced object span. Tracks quote/escape state so brackets
 * inside strings are ignored.
 */
export function extractJsonSpan(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) throw new JsonHealingError("No JSON object found.", text);

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new JsonHealingError("Unbalanced JSON: object never closed.", text);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeResources(value: unknown): StepResource[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({ label: asString(r.label), url: asString(r.url) }))
    .filter((r) => r.label && r.url);
}

function normalizeDifficulty(value: unknown): Difficulty {
  return DIFFICULTIES.includes(value as Difficulty)
    ? (value as Difficulty)
    : "beginner";
}

function normalizeStep(value: unknown): SyllabusStepDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const title = asString(record.title).trim();
  if (!title) return null;
  return {
    title,
    content: asString(record.content),
    resources: normalizeResources(record.resources),
    estimatedMinutes: asOptionalNumber(record.estimatedMinutes),
  };
}

/** Clean, parse, and validate raw model output into a {@link SyllabusDraft}. */
export function healAndValidate(raw: string): SyllabusDraft {
  const span = extractJsonSpan(stripCodeFences(raw));

  let parsed: unknown;
  try {
    parsed = JSON.parse(span);
  } catch {
    throw new JsonHealingError("Model output was not valid JSON.", raw);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new JsonHealingError("Model output was not a JSON object.", raw);
  }

  const record = parsed as Record<string, unknown>;
  const steps = (Array.isArray(record.steps) ? record.steps : [])
    .map(normalizeStep)
    .filter((s): s is SyllabusStepDraft => s !== null);

  if (steps.length === 0) {
    throw new JsonHealingError("Syllabus contained no usable steps.", raw);
  }

  return {
    title: asString(record.title, "Untitled path").trim() || "Untitled path",
    topic: asString(record.topic).trim(),
    description: asString(record.description),
    difficulty: normalizeDifficulty(record.difficulty),
    estimatedHours: asOptionalNumber(record.estimatedHours),
    steps,
  };
}
