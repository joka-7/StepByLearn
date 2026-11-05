/**
 * Vercel's env var UI is a common source of accidentally-pasted leading/
 * trailing whitespace or wrapping quotes; a stray quote in a client ID breaks
 * Google sign-in with an opaque error, so the value is trimmed and unquoted.
 */
export function cleanEnvVar(value: string | undefined): string | undefined {
  return value?.trim().replace(/^['"]|['"]$/g, "") || undefined;
}

/** The OAuth Web client ID, or "" when cloud sync isn't configured for this build. */
export const GOOGLE_CLIENT_ID = cleanEnvVar(import.meta.env.VITE_GOOGLE_CLIENT_ID) ?? "";
