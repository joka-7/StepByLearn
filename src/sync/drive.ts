/**
 * The app's single Drive sync client, configured from the environment.
 * Tests build their own with createDriveSync and injected fakes instead.
 */

import { Capacitor } from "@capacitor/core";
import { GOOGLE_CLIENT_ID } from "./clientId";
import { createDriveSync } from "./driveSync";
import { createNativeGoogleAuth } from "./nativeGoogleAuth";

const fetchImpl: typeof fetch = (input, init) => fetch(input, init);

export const driveSync = createDriveSync({
  clientId: GOOGLE_CLIENT_ID,
  fetchImpl,
  // Google refuses its browser sign-in inside the Android WebView, so the
  // Android app asks the OS for the token instead.
  nativeAuth: Capacitor.isNativePlatform()
    ? createNativeGoogleAuth({ webClientId: GOOGLE_CLIENT_ID, fetchImpl })
    : null,
});
