/**
 * Repository for {@link LearningPath} aggregates.
 *
 * All access to path storage goes through these functions so the rest of the app
 * never touches Dexie directly — keeping the storage engine swappable.
 */

import { db } from "../db/database";
import type { LearningPath, PathStep } from "../domain/types";

/** Persist a new (or replace an existing) path with all its steps. */
export async function savePath(path: LearningPath): Promise<void> {
  await db.paths.put(path);
}

/** Return every path, newest first. */
export async function listPaths(): Promise<LearningPath[]> {
  return db.paths.orderBy("createdAt").reverse().toArray();
}

/** Return a single path by id, or undefined if absent. */
export async function getPath(id: string): Promise<LearningPath | undefined> {
  return db.paths.get(id);
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
    const path = await db.paths.get(pathId);
    if (!path) return undefined;
    const updated: LearningPath = {
      ...path,
      steps: path.steps.map((s) => (s.id === stepId ? mutate(s) : s)),
      updatedAt: new Date().toISOString(),
    };
    await db.paths.put(updated);
    return updated;
  });
}
