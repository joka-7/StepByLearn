/**
 * The pure reconcile rule for path sync: last write wins, per path, by
 * `updatedAt`. Kept free of Firebase/Dexie so it can be tested directly.
 *
 * Tombstones (`deletedAt` set) are ordinary records here — a delete is just
 * the newest write — which is what stops a device that was offline during a
 * delete from resurrecting the path.
 */

import type { LearningPath } from "../domain/types";

export interface SyncPlan {
  /** Remote versions newer than (or missing from) the local store. */
  pull: LearningPath[];
  /** Local versions newer than (or missing from) the cloud. */
  push: LearningPath[];
  /** Ids already identical on both sides. */
  inSync: string[];
}

export function planSync(
  local: readonly LearningPath[],
  remote: readonly LearningPath[],
): SyncPlan {
  const localById = new Map(local.map((p) => [p.id, p]));
  const remoteById = new Map(remote.map((p) => [p.id, p]));
  const plan: SyncPlan = { pull: [], push: [], inSync: [] };

  for (const id of new Set([...localById.keys(), ...remoteById.keys()])) {
    const l = localById.get(id);
    const r = remoteById.get(id);
    if (l && (!r || l.updatedAt > r.updatedAt)) plan.push.push(l);
    else if (r && (!l || r.updatedAt > l.updatedAt)) plan.pull.push(r);
    else plan.inSync.push(id);
  }
  return plan;
}
