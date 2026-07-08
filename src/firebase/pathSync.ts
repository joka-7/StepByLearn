/**
 * Bidirectional mirror between Dexie's `paths` table and this user's
 * `users/{uid}/paths` Firestore subcollection.
 *
 * The UI never talks to Firestore directly — it only ever reads Dexie (via
 * `useLiveQuery`), so once this is running, cloud changes simply appear
 * through the same reactive path a local edit would.
 *
 * Loop-breaking: `lastSynced` records the `updatedAt` this engine last wrote
 * in *either* direction for each path id. A local change is only pushed up if
 * its `updatedAt` differs from that record; a remote change is only pulled
 * down if its `updatedAt` differs *and* it's newer than the local copy (or
 * there is no local copy) — this is the last-write-wins rule. Without this
 * map, writing a pulled-down doc into Dexie would immediately be seen by the
 * local watcher and pushed straight back up.
 */

import { liveQuery } from "dexie";
import { collection, deleteDoc, doc, getFirestore, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../db/database";
import type { LearningPath } from "../domain/types";
import { firebaseApp } from "./config";

const firestore = firebaseApp ? getFirestore(firebaseApp) : null;

/** Start syncing; call the returned function to stop (e.g. on sign-out). */
export function startPathSync(uid: string): () => void {
  if (!firestore) return () => {};

  const lastSynced = new Map<string, string>();
  let knownLocalIds = new Set<string>();
  const pathsCollection = collection(firestore, "users", uid, "paths");

  const localSubscription = liveQuery(() => db.paths.toArray()).subscribe({
    next: (paths) => {
      const currentIds = new Set(paths.map((p) => p.id));

      for (const id of knownLocalIds) {
        if (!currentIds.has(id)) {
          lastSynced.delete(id);
          void deleteDoc(doc(pathsCollection, id));
        }
      }

      for (const path of paths) {
        if (path.updatedAt !== lastSynced.get(path.id)) {
          lastSynced.set(path.id, path.updatedAt);
          void setDoc(doc(pathsCollection, path.id), path);
        }
      }

      knownLocalIds = currentIds;
    },
    error: (err) => console.error("Local path sync failed:", err),
  });

  const stopRemoteListener = onSnapshot(
    pathsCollection,
    (snapshot) => {
      for (const change of snapshot.docChanges()) {
        const id = change.doc.id;

        if (change.type === "removed") {
          lastSynced.delete(id);
          void db.paths.delete(id);
          continue;
        }

        const remote = change.doc.data() as LearningPath;
        if (remote.updatedAt === lastSynced.get(id)) continue;

        void db.paths.get(id).then((local) => {
          if (local && local.updatedAt >= remote.updatedAt) return;
          lastSynced.set(id, remote.updatedAt);
          void db.paths.put(remote);
        });
      }
    },
    (err) => console.error("Remote path sync failed:", err),
  );

  return () => {
    localSubscription.unsubscribe();
    stopRemoteListener();
  };
}
