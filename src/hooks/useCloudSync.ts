import { useCallback, useEffect, useState } from "react";
import { clearLocalPaths, listAllPathRecords } from "../repositories/pathRepository";
import { readDataOwner, writeDataOwner } from "../sync/dataOwner";
import { driveSync } from "../sync/drive";
import type { DriveUser } from "../sync/driveSync";
import { startPathDriveSync, type SyncStatus } from "../sync/pathDriveSync";
import { dexiePathStore } from "../sync/pathStore";

export type CloudSyncState =
  /** No Google client ID in this build. */
  | { kind: "unavailable" }
  /** `needsReconnect`: this device holds an account's courses but its Drive session lapsed. */
  | { kind: "signed-out"; needsReconnect: boolean }
  | { kind: "checking" }
  /** Local courses belong to a different account; waiting on the learner. */
  | { kind: "account-conflict" }
  | { kind: "active"; status: SyncStatus };

export interface CloudSync {
  state: CloudSyncState;
  /** Open Google's sign-in. Must be called straight from a click, or the popup is blocked. */
  signIn: () => Promise<DriveUser>;
  /** Sign out and remove this account's courses from the device (they stay in Drive). */
  signOut: () => Promise<void>;
  /** Resolve an account conflict by removing the other account's courses from this device. */
  replaceLocalData: () => Promise<void>;
  /** Resolve an account conflict by signing back out, leaving local courses alone. */
  cancelSignIn: () => Promise<void>;
  /** Delete every synced file from Drive and revoke access; local courses stay on this device. */
  deleteSyncedData: () => Promise<void>;
}

/**
 * Runs path sync for the connected user. Before the first sync on a device
 * whose courses belong to a *different* account it stops and asks, so that
 * account's courses are never merged into this one.
 */
export function useCloudSync(user: DriveUser | null): CloudSync {
  const [checked, setChecked] = useState<{ uid: string; conflict: boolean } | null>(null);
  const [status, setStatus] = useState<SyncStatus>({ state: "syncing" });
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      const owner = readDataOwner();
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
    writeDataOwner(uid);
    return startPathDriveSync({ sync: driveSync, store: dexiePathStore, onStatus: setStatus });
  }, [ready, uid]);

  const signOut = useCallback(async () => {
    await driveSync.signOut();
    await clearLocalPaths();
    writeDataOwner(null);
  }, []);

  const replaceLocalData = useCallback(async () => {
    if (!uid) return;
    await clearLocalPaths();
    writeDataOwner(uid);
    setChecked({ uid, conflict: false });
  }, [uid]);

  const cancelSignIn = useCallback(() => driveSync.signOut(), []);

  const deleteSyncedData = useCallback(async () => {
    await driveSync.deleteAllSyncedData();
    // These courses are no longer mirrored to any account.
    writeDataOwner(null);
  }, []);

  let state: CloudSyncState;
  if (!driveSync.isCloudConfigured()) state = { kind: "unavailable" };
  else if (!uid) state = { kind: "signed-out", needsReconnect: readDataOwner() !== null };
  else if (checked?.uid !== uid) state = { kind: "checking" };
  else if (checked.conflict) state = { kind: "account-conflict" };
  else state = { kind: "active", status };

  return {
    state,
    signIn: driveSync.signInWithGoogle,
    signOut,
    replaceLocalData,
    cancelSignIn,
    deleteSyncedData,
  };
}
