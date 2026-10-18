/**
 * Which Google account the courses on this device belong to.
 *
 * Set once courses have been reconciled with an account's Drive; cleared on
 * sign-out together with the local courses. A different account connecting on
 * a device that still holds someone else's courses must never merge them in.
 */

const OWNER_KEY = "stepbylearn.syncOwner";

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The uid whose courses are on this device, or null for courses created before any sign-in. */
export function readDataOwner(): string | null {
  try {
    return storage()?.getItem(OWNER_KEY) || null;
  } catch {
    return null;
  }
}

export function writeDataOwner(uid: string | null): void {
  try {
    if (uid === null) storage()?.removeItem(OWNER_KEY);
    else storage()?.setItem(OWNER_KEY, uid);
  } catch {
    // Unrecorded ownership degrades to treating the courses as pre-sign-in ones.
  }
}
