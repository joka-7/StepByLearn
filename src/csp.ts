/**
 * The Content-Security-Policy for the production build.
 *
 * Why it matters here: the app keeps AI provider keys and a Google Drive token
 * in localStorage, so the worst outcome of an injected script is sending them
 * somewhere. This policy lets the page talk only to the hosts below, so even a
 * successful injection can't exfiltrate them, and it forbids inline and eval'd
 * script.
 *
 * It is injected as a <meta> tag at build time (see vite.config.ts), which
 * covers both the website and the Android app's bundled copy. The dev server
 * is exempt because Vite's hot reload relies on an inline script.
 * `frame-ancestors` can't be set from a <meta>, so it stays an HTTP header in
 * vercel.json.
 */

import type { ProviderId } from "modeldispatcher-browser-agent";

/**
 * Where each AI provider's API lives. Keyed by the package's own provider id,
 * so adding a provider to modeldispatcher-browser-agent is a type error here
 * until its origin is listed.
 */
export const PROVIDER_ORIGINS: Record<ProviderId, readonly string[]> = {
  anthropic: ["https://api.anthropic.com"],
  openai: ["https://api.openai.com"],
  groq: ["https://api.groq.com"],
  gemini: ["https://generativelanguage.googleapis.com"],
  // A local Ollama server. A custom URL (e.g. another machine on the LAN) is
  // blocked unless added through CSP_EXTRA_CONNECT_SRC at build time.
  ollama: ["http://localhost:11434", "http://127.0.0.1:11434"],
};

/** Google sign-in (Identity Services) and the Drive and account endpoints sync uses. */
const GOOGLE_CONNECT = [
  "https://accounts.google.com/gsi/",
  "https://www.googleapis.com",
  "https://openidconnect.googleapis.com",
  "https://oauth2.googleapis.com",
];

/** An origin only: scheme, host and optional port. No paths, wildcards or separators. */
const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i;

export class InvalidCspSourceError extends Error {
  constructor(source: string) {
    super(
      `CSP_EXTRA_CONNECT_SRC entries must be plain origins like https://host:port, got "${source}".`,
    );
    this.name = "InvalidCspSourceError";
  }
}

/** Parse extra allowed `connect-src` origins (whitespace- or comma-separated). */
export function parseExtraConnectSources(raw: string | undefined): string[] {
  const entries = (raw ?? "").split(/[\s,]+/).filter(Boolean);
  for (const entry of entries) {
    if (!ORIGIN.test(entry)) throw new InvalidCspSourceError(entry);
  }
  return entries;
}

export function buildCsp(extraConnectSources: readonly string[] = []): string {
  const connect = [
    "'self'",
    ...Object.values(PROVIDER_ORIGINS).flat(),
    ...GOOGLE_CONNECT,
    ...extraConnectSources,
  ];
  const directives: Record<string, readonly string[]> = {
    "default-src": ["'self'"],
    // Google's sign-in script is the only third-party script.
    "script-src": ["'self'", "https://accounts.google.com/gsi/client"],
    "style-src": [
      "'self'",
      "https://fonts.googleapis.com",
      "https://accounts.google.com/gsi/style",
    ],
    "font-src": ["https://fonts.gstatic.com"],
    // YouTube thumbnails on video steps.
    "img-src": ["'self'", "data:", "https://img.youtube.com"],
    "connect-src": connect,
    "frame-src": ["https://accounts.google.com/gsi/"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}
