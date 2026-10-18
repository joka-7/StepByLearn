import { useCallback, useEffect, useRef, useState } from "react";
import { signOutUser, type User } from "../firebase/auth";
import { deleteCloudPaths, startPathSync, type SyncStatus } from "../firebase/pathSync";
import { readDataOwner, writeDataOwner } from "../sync/dataOwner";
import { clearLocalPaths, listAllPathRecords } from "../repositories/pathRepository";

export type CloudSyncState =
  | { kind: "signed-out" }
  | { kind: "checking" }
  /** Local courses belong to a different account; waiting on the learner. */
  | { kind: "account-conflict" }
  | { kind: "active"; status: SyncStatus };

export interface CloudSync {
  state: CloudSyncState;
  /** Resolve an account conflict by removing the other account's courses from this device. */
  replaceLocalData: () => Promise<void>;
  /** Resolve an account conflict by signing back out, leaving local data alone. */
  cancelSignIn: () => Promise<void>;
  /** Delete this user's cloud copy, then sign out; local courses stay on this device. */
  deleteCloudData: () => Promise<void>;
}

/**
 * Runs path sync for the signed-in user. Before the first sync on a device
 * whose local courses were last synced with a *different* account, it stops
 * and asks — otherwise that account's courses would be uploaded into this one.
 */
export function useCloudSync(user: User | null): CloudSync {
  const [checked, setChecked] = useState<{ uid: string; conflict: boolean } | null>(null);
  const [status, setStatus] = useState<SyncStatus>({ state: "syncing" });
  const stopSyncRef = useRef<(() => void) | null>(null);
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const owner = readDataOwner();
    void (async () => {
      const hasLocalData = (await listAllPathRecords()).length > 0;
      if (!cancelled)
        setChecked({ uid, conflict: owner !== null && owner !== uid && hasLocalData });
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const ready = uid !== null && checked?.uid === uid && !checked.conflict;

  useEffect(() => {
    if (!ready || !uid) return;
    const stop = startPathSync(uid, setStatus);
    stopSyncRef.current = stop;
    return () => {
      stop();
      stopSyncRef.current = null;
    };
  }, [ready, uid]);

  const replaceLocalData = useCallback(async () => {
    if (!uid) return;
    await clearLocalPaths();
    writeDataOwner(uid);
    setChecked({ uid, conflict: false });
  }, [uid]);

  const cancelSignIn = useCallback(async () => {
    await signOutUser();
  }, []);

  const deleteCloudData = useCallback(async () => {
    if (!uid) return;
    // Stop first: the live listener would otherwise mirror the cloud deletes
    // into this device's local copy.
    stopSyncRef.current?.();
    await deleteCloudPaths(uid);
    writeDataOwner(null);
    await signOutUser();
  }, [uid]);

  let state: CloudSyncState;
  if (!uid) state = { kind: "signed-out" };
  else if (checked?.uid !== uid) state = { kind: "checking" };
  else if (checked.conflict) state = { kind: "account-conflict" };
  else state = { kind: "active", status };

  return { state, replaceLocalData, cancelSignIn, deleteCloudData };
}
