/**
 * Repository for {@link LearningPath} aggregates.
 *
 * All access to path storage goes through these functions so the rest of the app
 * never touches Dexie directly — keeping the storage engine swappable.
 */

import { db } from "../db/database";
import type { ContentType, LearningPath, PathStep } from "../domain/types";

/**
 * Backfill fields onto a step that may have been written by an earlier schema
 * version (before steps carried type/duration/material links/resources/
 * keyConcepts). Without this, reading old IndexedDB data crashes the UI on
 * `undefined.map()` the moment it touches a field that didn't exist yet.
 */
function normalizeStep(raw: PathStep & Record<string, unknown>): PathStep {
  const legacyContent = typeof raw.content === "string" ? raw.content : "";
  const resources = Array.isArray(raw.resources)
    ? raw.resources
        .filter(
          (r): r is PathStep["resources"][number] =>
            typeof r === "object" && r !== null && "title" in r,
        )
        .map((r) => ({ ...r, url: typeof r.url === "string" ? r.url : "" }))
    : [];
  return {
    ...raw,
    duration: raw.duration ?? "30 minutes",
    type: (raw.type as ContentType) ?? "text",
    description: raw.description ?? legacyContent,
    keyConcepts: raw.keyConcepts ?? [],
    materialTitle: raw.materialTitle ?? "",
    materialUrl: raw.materialUrl ?? "",
    resources,
  };
}

/** Backfill fields onto a path that may have been written by an earlier schema. */
function normalizePath(raw: LearningPath & Record<string, unknown>): LearningPath {
  return {
    ...raw,
    stepDuration: raw.stepDuration ?? "30 minutes",
    contentType: raw.contentType ?? "all",
    currentKnowledge: raw.currentKnowledge ?? "",
    steps: raw.steps.map((s) => normalizeStep(s as PathStep & Record<string, unknown>)),
  };
}

/** Persist a new (or replace an existing) path with all its steps. */
export async function savePath(path: LearningPath): Promise<void> {
  await db.paths.put(path);
}

/** Return every path, newest first. */
export async function listPaths(): Promise<LearningPath[]> {
  const paths = await db.paths.orderBy("createdAt").reverse().toArray();
  return paths.map((p) => normalizePath(p as LearningPath & Record<string, unknown>));
}

/** Return a single path by id, or undefined if absent. */
export async function getPath(id: string): Promise<LearningPath | undefined> {
  const path = await db.paths.get(id);
  return path && normalizePath(path as LearningPath & Record<string, unknown>);
}

/** Delete a path and everything embedded in it. */
export async function deletePath(id: string): Promise<void> {
  await db.paths.delete(id);
}

/**
 * Apply an update to a single step within a path and persist the result.
 *
 * Runs inside a transaction so a concurrent edit can't interleave a partial
 * write. Returns the updated path, or undefined if the path no longer exists.
 */
export async function updateStep(
  pathId: string,
  stepId: string,
  mutate: (step: PathStep) => PathStep,
): Promise<LearningPath | undefined> {
  return db.transaction("rw", db.paths, async () => {
    const raw = await db.paths.get(pathId);
    if (!raw) return undefined;
    const path = normalizePath(raw as LearningPath & Record<string, unknown>);
    const updated: LearningPath = {
      ...path,
      steps: path.steps.map((s) => (s.id === stepId ? mutate(s) : s)),
      updatedAt: new Date().toISOString(),
    };
    await db.paths.put(updated);
    return updated;
  });
}

/**
 * Append new steps to the end of an existing path's curriculum, re-indexing
 * their `orderIndex` to continue from the current step count.
 */
export async function appendSteps(
  pathId: string,
  newSteps: PathStep[],
): Promise<LearningPath | undefined> {
  return db.transaction("rw", db.paths, async () => {
    const raw = await db.paths.get(pathId);
    if (!raw) return undefined;
    const path = normalizePath(raw as LearningPath & Record<string, unknown>);
    const startIndex = path.steps.length;
    const updated: LearningPath = {
      ...path,
      steps: [
        ...path.steps,
        ...newSteps.map((s, i) => ({ ...s, orderIndex: startIndex + i })),
      ],
      updatedAt: new Date().toISOString(),
    };
    await db.paths.put(updated);
    return updated;
  });
}
