/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OAuth Web client ID for Google Drive sync; empty or unset disables cloud sync. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
