/**
 * Google sign-in, thin wrapper over the Firebase Auth SDK.
 *
 * Every function here is a no-op (or throws a clear error) when Firebase
 * isn't configured, so the rest of the app never needs its own "is cloud
 * sync available" branching beyond checking {@link firebaseConfigured}.
 */

import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { firebaseApp, firebaseConfigured } from "./config";

const auth = firebaseApp ? getAuth(firebaseApp) : null;
const googleProvider = new GoogleAuthProvider();

export class CloudSyncNotConfiguredError extends Error {
  constructor() {
    super("Cloud sync isn't configured for this deployment yet.");
    this.name = "CloudSyncNotConfiguredError";
  }
}

/** Open the Google sign-in popup. */
export async function signInWithGoogle(): Promise<void> {
  if (!auth) throw new CloudSyncNotConfiguredError();
  await signInWithPopup(auth, googleProvider);
}

/** Sign the current user out. */
export async function signOutUser(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

/** Subscribe to auth state; returns an unsubscribe function. */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export { firebaseConfigured };
export type { User };
