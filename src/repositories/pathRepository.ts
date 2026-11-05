/**
 * Repository for {@link LearningPath} aggregates.
 *
 * All access to path storage goes through these functions so the rest of the app
 * never touches Dexie directly — keeping the storage engine swappable.
 *
 * Deleted paths stay in the table as tombstones (`deletedAt` set) so sync can
 * propagate the delete and the UI can offer Undo; the "live" readers below
 * never return them.
 */

import { db } from "../db/database";
import { parseStoredPath } from "../domain/storedPath";
import type { LearningPath, PathStep } from "../domain/types";

/** Tombstones older than this are hard-deleted locally. */
const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function parseRows(rows: unknown[]): LearningPath[] {
  return rows.map(parseStoredPath).filter((p): p is LearningPath => p !== null);
}

/** Persist a new (or replace an existing) path with all its steps. */
export async function savePath(path: LearningPath): Promise<void> {
  await db.paths.put(path);
}

/** Return every live (not deleted) path, newest first. */
export async function listPaths(): Promise<LearningPath[]> {
  const rows = await db.paths.orderBy("createdAt").reverse().toArray();
  return parseRows(rows).filter((p) => p.deletedAt === null);
}

/** Every stored path including tombstones — what sync and backup operate on. */
export async function listAllPathRecords(): Promise<LearningPath[]> {
  return parseRows(await db.paths.toArray());
}

/** Return a single live path by id, or undefined if absent or deleted. */
export async function getPath(id: string): Promise<LearningPath | undefined> {
  const path = parseStoredPath(await db.paths.get(id));
  return path && path.deletedAt === null ? path : undefined;
}

/**
 * Read-modify-write one path inside a transaction, so a concurrent write
 * (another tab, or a sync pull) can't be overwritten by a stale copy.
 * Returns the updated path, or undefined if it no longer exists.
 */
export async function updatePath(
  pathId: string,
  mutate: (path: LearningPath) => LearningPath,
): Promise<LearningPath | undefined> {
  return db.transaction("rw", db.paths, async () => {
    const path = parseStoredPath(await db.paths.get(pathId));
    if (!path || path.deletedAt !== null) return undefined;
    const updated: LearningPath = { ...mutate(path), updatedAt: new Date().toISOString() };
    await db.paths.put(updated);
    return updated;
  });
}

/** Soft-delete a path (see {@link restorePath} to undo). */
export async function deletePath(id: string): Promise<void> {
  await db.transaction("rw", db.paths, async () => {
    const path = parseStoredPath(await db.paths.get(id));
    if (!path) return;
    const now = new Date().toISOString();
    await db.paths.put({ ...path, deletedAt: now, updatedAt: now });
  });
}

/** Undo a {@link deletePath}. */
export async function restorePath(id: string): Promise<void> {
  await db.transaction("rw", db.paths, async () => {
    const path = parseStoredPath(await db.paths.get(id));
    if (!path || path.deletedAt === null) return;
    await db.paths.put({ ...path, deletedAt: null, updatedAt: new Date().toISOString() });
  });
}

/** Hard-delete tombstones past the retention window. */
export async function purgeExpiredTombstones(now: Date = new Date()): Promise<void> {
  const cutoff = now.getTime() - TOMBSTONE_RETENTION_MS;
  const expired = (await listAllPathRecords())
    .filter((p) => p.deletedAt !== null && Date.parse(p.deletedAt) < cutoff)
    .map((p) => p.id);
  await db.paths.bulkDelete(expired);
}

/** Remove every path from this device (used when another account signs in). */
export async function clearLocalPaths(): Promise<void> {
  await db.paths.clear();
}

/** Write paths exactly as given (sync pulls and backup imports keep their own timestamps). */
export async function putPathRecords(paths: readonly LearningPath[]): Promise<void> {
  await db.paths.bulkPut([...paths]);
}

/** Apply an update to a single step within a path and persist the result. */
export async function updateStep(
  pathId: string,
  stepId: string,
  mutate: (step: PathStep) => PathStep,
): Promise<LearningPath | undefined> {
  return updatePath(pathId, (path) => ({
    ...path,
    steps: path.steps.map((s) => (s.id === stepId ? mutate(s) : s)),
  }));
}

/**
 * Append new steps to the end of an existing path's curriculum, re-indexing
 * their `orderIndex` to continue from the current step count.
 */
export async function appendSteps(
  pathId: string,
  newSteps: PathStep[],
): Promise<LearningPath | undefined> {
  return updatePath(pathId, (path) => ({
    ...path,
    steps: [
      ...path.steps,
      ...newSteps.map((s, i) => ({ ...s, orderIndex: path.steps.length + i })),
    ],
  }));
}
