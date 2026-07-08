/**
 * Firebase app initialization.
 *
 * These config values identify the Firebase project; they are not secrets
 * (Firebase's own guidance: access control is enforced by Firestore security
 * rules and Auth, not by hiding this config) but they are project-specific,
 * so they come from Vite env vars rather than being hardcoded — the same
 * value works for local dev (`.env.local`) and the Vercel deployment (set as
 * Project Environment Variables there) without editing source.
 *
 * When the env vars are absent (e.g. local dev before a Firebase project has
 * been configured), `firebaseConfigured` is false and callers must treat
 * cloud sync as unavailable rather than initializing against an empty config.
 */

import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";

/**
 * Vercel's env var UI is a common source of accidentally-pasted leading/
 * trailing whitespace or wrapping quotes. A stray quote in `authDomain` in
 * particular breaks Google sign-in with an opaque DNS/network error rather
 * than a clear config error, so every value is defensively trimmed and
 * unquoted here.
 */
export function cleanEnvVar(value: string | undefined): string | undefined {
  return value?.trim().replace(/^['"]|['"]$/g, "") || undefined;
}

const firebaseConfig: FirebaseOptions = {
  apiKey: cleanEnvVar(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: cleanEnvVar(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: cleanEnvVar(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: cleanEnvVar(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: cleanEnvVar(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanEnvVar(import.meta.env.VITE_FIREBASE_APP_ID),
};

/** Whether all required Firebase env vars are present. */
export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId,
);

export const firebaseApp = firebaseConfigured
  ? (getApps()[0] ?? initializeApp(firebaseConfig))
  : null;
