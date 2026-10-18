/**
 * What the sync engine needs from local storage, kept behind an interface so
 * the engine can be tested without IndexedDB.
 */

import { liveQuery } from "dexie";
import { db } from "../db/database";
import { parseStoredPath } from "../domain/storedPath";
import type { LearningPath } from "../domain/types";
import { listAllPathRecords } from "../repositories/pathRepository";

export interface PathStore {
  /** Every stored path, including deleted ones (tombstones). */
  listAll: () => Promise<LearningPath[]>;
  /**
   * Write each path only if it is newer than what is stored (or absent), as one
   * atomic step, and return the ones actually written. A pull that raced with a
   * local edit therefore can't overwrite it.
   */
  putIfNewer: (paths: readonly LearningPath[]) => Promise<LearningPath[]>;
  /** Call `onChange` with the full list now and after every change; returns an unsubscribe. */
  subscribe: (
    onChange: (paths: LearningPath[]) => void,
    onError: (error: unknown) => void,
  ) => () => void;
}

export const dexiePathStore: PathStore = {
  listAll: listAllPathRecords,

  putIfNewer: (paths) =>
    db.transaction("rw", db.paths, async () => {
      const written: LearningPath[] = [];
      for (const incoming of paths) {
        const existing = parseStoredPath(await db.paths.get(incoming.id));
        if (!existing || existing.updatedAt < incoming.updatedAt) {
          await db.paths.put(incoming);
          written.push(incoming);
        }
      }
      return written;
    }),

  subscribe(onChange, onError) {
    const subscription = liveQuery(listAllPathRecords).subscribe({
      next: onChange,
      error: onError,
    });
    return () => subscription.unsubscribe();
  },
};
