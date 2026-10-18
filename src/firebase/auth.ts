/**
 * Google sign-in, thin wrapper over the Firebase Auth SDK.
 *
 * Every function here is a no-op (or throws a clear error) when Firebase
 * isn't configured, so the rest of the app never needs its own "is cloud
 * sync available" branching beyond checking {@link firebaseConfigured}.
 * The Auth SDK is loaded lazily (see `config.ts`).
 */

import type { Auth, User } from "firebase/auth";
import { CloudSyncNotConfiguredError, firebaseConfigured, loadFirebaseApp } from "./config";

interface LoadedAuth {
  auth: Auth;
  sdk: typeof import("firebase/auth");
}

let loaded: LoadedAuth | null = null;

async function loadAuth(): Promise<LoadedAuth> {
  if (loaded) return loaded;
  const [app, sdk] = await Promise.all([loadFirebaseApp(), import("firebase/auth")]);
  loaded = { auth: sdk.getAuth(app), sdk };
  return loaded;
}

/** Open the Google sign-in popup. */
export async function signInWithGoogle(): Promise<void> {
  if (!firebaseConfigured) throw new CloudSyncNotConfiguredError();
  // Once loaded (onAuthChange loads it at startup), call the popup with no
  // await in front of it: browsers block popups opened after the click's
  // user-activation has lapsed.
  const { auth, sdk } = loaded ?? (await loadAuth());
  await sdk.signInWithPopup(auth, new sdk.GoogleAuthProvider());
}

/** Sign the current user out. */
export async function signOutUser(): Promise<void> {
  if (!firebaseConfigured) return;
  const { auth, sdk } = await loadAuth();
  await sdk.signOut(auth);
}

/** Subscribe to auth state; returns an unsubscribe function. */
export function onAuthChange(
  callback: (user: User | null) => void,
  onError: (error: unknown) => void,
): () => void {
  if (!firebaseConfigured) {
    callback(null);
    return () => {};
  }
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;
  loadAuth().then(
    ({ auth, sdk }) => {
      if (!cancelled) unsubscribe = sdk.onAuthStateChanged(auth, callback);
    },
    (error: unknown) => {
      callback(null);
      onError(error);
    },
  );
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

export { CloudSyncNotConfiguredError, firebaseConfigured };
export type { User };
