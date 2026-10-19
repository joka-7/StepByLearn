/**
 * Mirrors the local `paths` store with the user's Drive (see driveSync.ts).
 *
 * The UI only ever reads local storage, so a pull simply shows up through the
 * same reactive path a local edit would. The conflict rule is per course: the
 * newer `updatedAt` wins, in either direction (see planSync).
 *
 * Why a stale device can't overwrite newer cloud data: nothing is pushed until
 * the first pull has completed, and a course is pushed only when it is
 * strictly newer than the cloud's copy. Pulled courses are recorded in
 * `lastSynced` before they are written, so the local watcher doesn't echo them
 * back, and the watcher also ignores any snapshot older than what was last
 * synced.
 *
 * A deleted course is synced as a slim tombstone (no title, no steps), so its
 * content leaves Drive; the full copy stays on the deleting device for Undo. A
 * tombstone for a course this device never had is not inserted.
 *
 * Pulls run at start, when the app becomes visible again, and when the network
 * returns — Drive has no change feed.
 */

import { parseStoredPath } from "../domain/storedPath";
import type { LearningPath } from "../domain/types";
import { DriveSyncError } from "./driveDocument";
import type { DriveSync } from "./driveSync";
import type { PathStore } from "./pathStore";
import { planSync } from "./syncPlan";

const COLLECTION = "paths";

/** Visibility/focus pulls closer together than this are skipped. */
const MIN_PULL_INTERVAL_MS = 10_000;

export type SyncStatus =
  | { state: "syncing" }
  | { state: "synced" }
  | { state: "offline" }
  | { state: "error"; message: string };

/** What can ask for a pull. `force` bypasses the minimum interval (e.g. the network returned). */
export type PullRequest = (options?: { force?: boolean }) => void;
export type PullTriggers = (request: PullRequest) => () => void;

export interface PathDriveSyncDeps {
  sync: DriveSync;
  store: PathStore;
  onStatus: (status: SyncStatus) => void;
  triggers?: PullTriggers;
  now?: () => number;
}

/** Pull when the app is shown again and when connectivity returns. */
export const browserPullTriggers: PullTriggers = (request) => {
  if (typeof document === "undefined" || typeof window === "undefined") return () => {};
  const onVisible = () => {
    if (document.visibilityState === "visible") request();
  };
  const onOnline = () => request({ force: true });
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
  };
};

/** The synced form of a path: a deleted one carries only what identifies it. */
function toWire(path: LearningPath): LearningPath {
  if (path.deletedAt === null) return path;
  return {
    id: path.id,
    title: "",
    topic: "",
    description: "",
    difficulty: path.difficulty,
    estimatedHours: null,
    modelName: "",
    stepDuration: path.stepDuration,
    contentType: path.contentType,
    currentKnowledge: "",
    steps: [],
    createdAt: path.createdAt,
    updatedAt: path.updatedAt,
    deletedAt: path.deletedAt,
  };
}

function toStatus(error: unknown): SyncStatus {
  if (error instanceof DriveSyncError) {
    if (error.code === "offline") return { state: "offline" };
    if (error.code === "signed-out") {
      return {
        state: "error",
        message: "Your Google Drive session expired. Reconnect to keep syncing.",
      };
    }
    return {
      state: "error",
      message: `Drive sync failed (${error.status || error.code || "error"}).`,
    };
  }
  return { state: "error", message: "Drive sync failed." };
}

/** Start syncing; call the returned function to stop (e.g. on sign-out). */
export function startPathDriveSync(deps: PathDriveSyncDeps): () => void {
  const { sync, store, onStatus } = deps;
  const triggers = deps.triggers ?? browserPullTriggers;
  const now = deps.now ?? (() => Date.now());

  const lastSynced = new Map<string, string>();
  const cleanups: (() => void)[] = [];
  let stopped = false;
  let initialized = false;
  let pendingWrites = 0;
  let failure: SyncStatus | null = null;
  let lastPullAt = Number.NEGATIVE_INFINITY;

  // Pulls and pushes run one at a time so a later snapshot can't interleave
  // with an earlier one's reads and writes.
  let queue: Promise<void> = Promise.resolve();
  function enqueue(task: () => Promise<void>): void {
    queue = queue
      .then(async () => {
        if (stopped) return;
        await task();
        failure = null;
      })
      .catch((error: unknown) => {
        failure = toStatus(error);
        if (failure.state === "error")
          console.error("Path sync error", { message: failure.message });
      })
      .finally(report);
  }

  function report(): void {
    if (stopped) return;
    if (failure) onStatus(failure);
    else if (!initialized || pendingWrites > 0) onStatus({ state: "syncing" });
    else onStatus({ state: "synced" });
  }

  async function push(paths: readonly LearningPath[]): Promise<void> {
    if (paths.length === 0) return;
    for (const path of paths) lastSynced.set(path.id, path.updatedAt);
    pendingWrites++;
    report();
    try {
      await sync.upsertMany(COLLECTION, paths.map(toWire));
    } catch (error) {
      // Forget them so the next pull's plan (or local change) retries.
      for (const path of paths) lastSynced.delete(path.id);
      throw error;
    } finally {
      pendingWrites--;
    }
  }

  async function reconcile(): Promise<void> {
    lastPullAt = now();
    const snapshot = await sync.loadCollection(COLLECTION);
    if (stopped) return;
    const remote = (snapshot?.items ?? [])
      .map(parseStoredPath)
      .filter((path): path is LearningPath => {
        if (path === null) console.warn("Skipped an invalid Drive path record");
        return path !== null;
      });
    const local = await store.listAll();
    const plan = planSync(local, remote);
    const localById = new Map(local.map((p) => [p.id, p]));

    // A tombstone for a course this device never had has nothing to delete.
    const toApply = plan.pull.filter((p) => p.deletedAt === null || localById.has(p.id));
    for (const path of plan.pull) lastSynced.set(path.id, path.updatedAt);
    await store.putIfNewer(toApply);
    for (const id of plan.inSync) {
      const path = localById.get(id);
      if (path) lastSynced.set(id, path.updatedAt);
    }
    await push(plan.push);

    if (!initialized) {
      initialized = true;
      startWatcher();
    }
  }

  function startWatcher(): void {
    cleanups.push(
      store.subscribe(
        (paths) =>
          enqueue(async () => {
            // Strictly newer only: a snapshot taken before a pull landed must
            // never push its older copy over what the pull just wrote.
            const changed = paths.filter((p) => p.updatedAt > (lastSynced.get(p.id) ?? ""));
            await push(changed);
          }),
        (error) => {
          failure = toStatus(error);
          report();
        },
      ),
    );
  }

  const requestPull: PullRequest = (options) => {
    if (stopped) return;
    if (!options?.force && now() - lastPullAt < MIN_PULL_INTERVAL_MS) return;
    enqueue(reconcile);
  };

  report();
  enqueue(reconcile);
  cleanups.push(triggers(requestPull));

  return () => {
    stopped = true;
    for (const cleanup of cleanups) cleanup();
  };
}
