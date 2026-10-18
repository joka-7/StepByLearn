/**
 * Bidirectional mirror between Dexie's `paths` table and this user's
 * `users/{uid}/paths` Firestore subcollection.
 *
 * The UI never talks to Firestore directly — it only ever reads Dexie (via
 * `useLiveQuery`), so once this is running, cloud changes simply appear
 * through the same reactive path a local edit would.
 *
 * Start-up reconcile: nothing is pushed until the first snapshot that comes
 * from the *server* (not the offline cache) has arrived. Then every path is
 * compared by {@link planSync} — newer `updatedAt` wins in either direction —
 * so a device holding a stale copy can never overwrite newer cloud data just
 * by signing in.
 *
 * Loop-breaking afterwards: `lastSynced` records the `updatedAt` known to be
 * identical on both sides for each path id. A local change is pushed only if
 * its `updatedAt` differs from that record; a remote change is pulled only if
 * it differs *and* is newer than the local copy. Without this map, writing a
 * pulled-down doc into Dexie would immediately be pushed straight back up.
 *
 * Remote documents are validated with {@link parseStoredPath} before they
 * touch IndexedDB; anything that can't be a path is skipped.
 */

import { liveQuery } from "dexie";
import type { DocumentSnapshot, Firestore } from "firebase/firestore";
import { parseStoredPath } from "../domain/storedPath";
import type { LearningPath } from "../domain/types";
import { listAllPathRecords, putPathRecords } from "../repositories/pathRepository";
import { db } from "../db/database";
import { loadFirebaseApp } from "./config";
import { planSync } from "./syncPlan";

export type SyncStatus =
  { state: "syncing" } | { state: "synced" } | { state: "error"; message: string };

const OWNER_KEY = "stepbylearn.syncOwner";

/** The uid whose cloud data this device's local paths were last reconciled with, if any. */
export function getLocalDataOwner(): string | null {
  return localStorage.getItem(OWNER_KEY);
}

export function setLocalDataOwner(uid: string | null): void {
  if (uid === null) localStorage.removeItem(OWNER_KEY);
  else localStorage.setItem(OWNER_KEY, uid);
}

interface LoadedFirestore {
  firestore: Firestore;
  sdk: typeof import("firebase/firestore");
}

async function loadFirestore(): Promise<LoadedFirestore> {
  const [app, sdk] = await Promise.all([loadFirebaseApp(), import("firebase/firestore")]);
  return { firestore: sdk.getFirestore(app), sdk };
}

function describeError(error: unknown): string {
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return `Cloud sync failed (${error.code}).`;
  }
  return "Cloud sync failed.";
}

function parseRemote(snapshot: DocumentSnapshot): LearningPath | null {
  const path = parseStoredPath(snapshot.data());
  if (!path || path.id !== snapshot.id) {
    console.warn("Skipped an invalid cloud path document", { id: snapshot.id });
    return null;
  }
  return path;
}

/** Start syncing; call the returned function to stop (e.g. on sign-out). */
export function startPathSync(uid: string, onStatus: (status: SyncStatus) => void): () => void {
  const lastSynced = new Map<string, string>();
  let stopped = false;
  let reconcileQueued = false;
  let initialized = false;
  let pendingWrites = 0;
  let lastError: string | null = null;
  const cleanups: (() => void)[] = [];

  // Snapshot handlers do async Dexie work; running them one at a time keeps
  // a later snapshot from interleaving with an earlier one's reads/writes.
  let queue: Promise<void> = Promise.resolve();
  function enqueue(task: () => Promise<void>): void {
    queue = queue.then(task).catch((error: unknown) => fail(error));
  }

  function report(): void {
    if (stopped) return;
    if (lastError) onStatus({ state: "error", message: lastError });
    else if (!initialized || pendingWrites > 0) onStatus({ state: "syncing" });
    else onStatus({ state: "synced" });
  }

  function fail(error: unknown): void {
    lastError = describeError(error);
    console.error("Path sync error", { message: lastError });
    report();
  }

  report();

  void loadFirestore().then(({ firestore, sdk }) => {
    if (stopped) return;
    const pathsCollection = sdk.collection(firestore, "users", uid, "paths");

    function push(path: LearningPath): void {
      lastSynced.set(path.id, path.updatedAt);
      pendingWrites++;
      report();
      sdk
        .setDoc(sdk.doc(pathsCollection, path.id), path)
        .then(
          () => {
            lastError = null;
          },
          (error: unknown) => {
            // Forget it so the next local change retries this path.
            lastSynced.delete(path.id);
            fail(error);
          },
        )
        .finally(() => {
          pendingWrites--;
          report();
        });
    }

    async function reconcile(remoteDocs: DocumentSnapshot[]): Promise<void> {
      const remote = remoteDocs.map(parseRemote).filter((p): p is LearningPath => p !== null);
      const plan = planSync(await listAllPathRecords(), remote);
      if (stopped) return;
      await putPathRecords(plan.pull);
      for (const p of plan.pull) lastSynced.set(p.id, p.updatedAt);
      for (const p of remote) if (plan.inSync.includes(p.id)) lastSynced.set(p.id, p.updatedAt);
      plan.push.forEach(push);
      setLocalDataOwner(uid);
      initialized = true;
      report();

      const local = liveQuery(listAllPathRecords).subscribe({
        next: (paths) => {
          for (const p of paths) if (p.updatedAt !== lastSynced.get(p.id)) push(p);
        },
        error: fail,
      });
      cleanups.push(() => local.unsubscribe());
    }

    async function applyRemoteChange(snapshot: DocumentSnapshot, removed: boolean): Promise<void> {
      if (removed) {
        // Current clients soft-delete; a hard removal comes from "Delete my
        // cloud data" on another device or an older app version.
        lastSynced.delete(snapshot.id);
        await db.paths.delete(snapshot.id);
        return;
      }
      const remote = parseRemote(snapshot);
      if (!remote || remote.updatedAt === lastSynced.get(remote.id)) return;
      const local = parseStoredPath(await db.paths.get(remote.id));
      if (local && local.updatedAt >= remote.updatedAt) return;
      lastSynced.set(remote.id, remote.updatedAt);
      await putPathRecords([remote]);
    }

    const stopRemote = sdk.onSnapshot(
      pathsCollection,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!reconcileQueued) {
          // An offline-cache snapshot may be empty or stale; reconciling
          // against it would push local data over newer cloud data.
          if (snapshot.metadata.fromCache) return;
          reconcileQueued = true;
          enqueue(() => reconcile(snapshot.docs));
          return;
        }
        // Queued behind the reconcile, so changes that land while it runs
        // are applied after it rather than lost.
        for (const change of snapshot.docChanges()) {
          enqueue(() => applyRemoteChange(change.doc, change.type === "removed"));
        }
      },
      fail,
    );
    cleanups.push(stopRemote);
  }, fail);

  return () => {
    stopped = true;
    cleanups.forEach((cleanup) => cleanup());
  };
}

/** Permanently delete every path this user has in the cloud. Local copies are untouched. */
export async function deleteCloudPaths(uid: string): Promise<void> {
  const { firestore, sdk } = await loadFirestore();
  const snapshot = await sdk.getDocs(sdk.collection(firestore, "users", uid, "paths"));
  await Promise.all(snapshot.docs.map((d) => sdk.deleteDoc(d.ref)));
}
