/**
 * Validate and normalize a learning path read from storage we don't fully
 * control: IndexedDB rows written by older app versions, and Drive sync files
 * (any device signed in to the account can write its own).
 *
 * Old rows lack fields added later (type/duration/material links/resources/
 * keyConcepts/deletedAt); those are backfilled. A value that can't be a path
 * at all yields null so callers skip it instead of crashing the UI on
 * `undefined.map()`. Every URL goes through {@link toSafeUrl}.
 */

import type {
  ContentType,
  Difficulty,
  LearningPath,
  LearningResource,
  PathStep,
  StepStatus,
} from "./types";
import { toSafeUrl } from "./urls";

const CONTENT_TYPES: readonly ContentType[] = ["video", "podcast", "text"];
const DIFFICULTIES: readonly Difficulty[] = ["beginner", "intermediate", "advanced"];
const STEP_STATUSES: readonly StepStatus[] = ["not_started", "in_progress", "done"];

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

function parseResource(value: unknown): LearningResource | null {
  if (!isRecord(value) || typeof value.title !== "string") return null;
  return {
    title: value.title,
    type: oneOf(CONTENT_TYPES, value.type, "text"),
    description: str(value.description),
    duration: str(value.duration),
    url: toSafeUrl(value.url),
  };
}

function parseStep(value: unknown, index: number): PathStep | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") {
    return null;
  }
  const resources = Array.isArray(value.resources)
    ? value.resources.map(parseResource).filter((r): r is LearningResource => r !== null)
    : [];
  return {
    id: value.id,
    orderIndex: typeof value.orderIndex === "number" ? value.orderIndex : index,
    title: value.title,
    duration: str(value.duration, "30 minutes"),
    type: oneOf(CONTENT_TYPES, value.type, "text"),
    // Pre-description rows stored the step body as `content`.
    description: str(value.description, str(value.content)),
    keyConcepts: Array.isArray(value.keyConcepts)
      ? value.keyConcepts.filter((c): c is string => typeof c === "string")
      : [],
    materialTitle: str(value.materialTitle),
    materialUrl: toSafeUrl(value.materialUrl),
    resources,
    status: oneOf(STEP_STATUSES, value.status, "not_started"),
    doneAt: nullableStr(value.doneAt),
    scheduledDate: nullableStr(value.scheduledDate),
    isMilestone: value.isMilestone === true,
  };
}

/** Parse an untrusted stored value into a {@link LearningPath}, or null if it can't be one. */
export function parseStoredPath(value: unknown): LearningPath | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id === "" ||
    typeof value.title !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    !Array.isArray(value.steps)
  ) {
    return null;
  }
  const steps = value.steps.map(parseStep).filter((s): s is PathStep => s !== null);
  return {
    id: value.id,
    title: value.title,
    topic: str(value.topic),
    description: str(value.description),
    difficulty: oneOf(DIFFICULTIES, value.difficulty, "beginner"),
    estimatedHours: typeof value.estimatedHours === "number" ? value.estimatedHours : null,
    modelName: str(value.modelName, "unknown"),
    stepDuration: str(value.stepDuration, "30 minutes"),
    contentType:
      value.contentType === "all" || value.contentType === undefined
        ? "all"
        : oneOf(CONTENT_TYPES, value.contentType, "text"),
    currentKnowledge: str(value.currentKnowledge),
    steps,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    deletedAt: nullableStr(value.deletedAt),
  };
}
