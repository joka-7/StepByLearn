/**
 * Google sign-in for the Android app.
 *
 * Google refuses OAuth inside an embedded WebView, so the browser token popup
 * in driveSync.ts cannot run in the Capacitor shell. This asks Android itself
 * (Credential Manager + AuthorizationClient, via @capgo/capacitor-social-login)
 * for the same `drive.appdata` access token, and can renew it without any UI
 * once the user has granted it — which the browser flow cannot.
 *
 * Returns tokens in the shape Google's browser token client uses
 * (`{ access_token, expires_in }`) so driveSync treats both alike.
 */

import type { NativeAuth, TokenResponse } from "./driveSync";

const SCOPES = ["https://www.googleapis.com/auth/drive.appdata", "email", "profile"];
const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

/** The slice of the SocialLogin plugin this module uses. */
export interface SocialLoginClient {
  initialize: (options: { google: { webClientId: string; mode: "online" } }) => Promise<void>;
  login: (options: {
    provider: "google";
    options: { scopes: string[] };
  }) => Promise<{ result: unknown }>;
  refresh: (options: { provider: "google"; options: { scopes: string[] } }) => Promise<void>;
  getAuthorizationCode: (options: {
    provider: "google";
  }) => Promise<{ accessToken?: string | undefined }>;
  logout: (options: { provider: "google" }) => Promise<unknown>;
}

const loadSocialLogin = async (): Promise<SocialLoginClient> =>
  (await import("@capgo/capacitor-social-login")).SocialLogin;

export interface NativeGoogleAuthDeps {
  /** The OAuth *Web* client ID. Android matches it to the Android client registered for this package and signing key. */
  webClientId: string;
  fetchImpl: typeof fetch;
  loadPlugin?: () => Promise<SocialLoginClient>;
}

/** Pull `result.accessToken.token` out of the plugin's login response without trusting its shape. */
function loginToken(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null) return undefined;
  const accessToken = (result as { accessToken?: unknown }).accessToken;
  if (typeof accessToken !== "object" || accessToken === null) return undefined;
  const token = (accessToken as { token?: unknown }).token;
  return typeof token === "string" && token !== "" ? token : undefined;
}

export function createNativeGoogleAuth(deps: NativeGoogleAuthDeps): NativeAuth {
  const { webClientId, fetchImpl, loadPlugin = loadSocialLogin } = deps;
  let ready: Promise<SocialLoginClient> | null = null;

  function plugin(): Promise<SocialLoginClient> {
    ready ??= loadPlugin()
      .then(async (socialLogin) => {
        await socialLogin.initialize({ google: { webClientId, mode: "online" } });
        return socialLogin;
      })
      .catch((err: unknown) => {
        ready = null;
        throw err;
      });
    return ready;
  }

  /** The plugin does not report expiry, and a cached token may be part-way through its hour. */
  async function withExpiry(accessToken: string | undefined): Promise<TokenResponse | null> {
    if (!accessToken) return null;
    const res = await fetchImpl(`${TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`);
    // 400 is Google saying the token is invalid; anything else is a failed
    // check, which must not be reported to the user as "access denied".
    if (res.status === 400) return null;
    if (!res.ok) throw new Error(`Could not check the Google token (${res.status}).`);
    const info = (await res.json()) as { expires_in?: unknown };
    const expiresIn = Number(info.expires_in);
    return Number.isFinite(expiresIn) && expiresIn > 0
      ? { access_token: accessToken, expires_in: expiresIn }
      : null;
  }

  return {
    /**
     * Interactive shows Google's account sheet; silent renews a token the user
     * already granted, and rejects if that needs the user. Resolves `null`
     * when Google returned no usable Drive token.
     */
    async requestToken({ interactive }) {
      const socialLogin = await plugin();
      if (interactive) {
        const { result } = await socialLogin.login({
          provider: "google",
          options: { scopes: SCOPES },
        });
        return withExpiry(loginToken(result));
      }
      await socialLogin.refresh({ provider: "google", options: { scopes: SCOPES } });
      const { accessToken } = await socialLogin.getAuthorizationCode({ provider: "google" });
      return withExpiry(accessToken);
    },

    async signOut() {
      const socialLogin = await plugin();
      await socialLogin.logout({ provider: "google" });
    },
  };
}
