import { describe, expect, it, vi } from "vitest";
import { createNativeGoogleAuth, type SocialLoginClient } from "./nativeGoogleAuth";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

function fakePlugin({
  loginToken = "login-token" as string | null,
  silentToken = "silent-token",
  initFailures = 0,
} = {}) {
  let failuresLeft = initFailures;
  return {
    initialize: vi.fn(async () => {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new Error("init failed");
      }
    }),
    login: vi.fn(async () => ({
      provider: "google",
      result: { accessToken: loginToken ? { token: loginToken } : null },
    })),
    refresh: vi.fn(async () => {}),
    getAuthorizationCode: vi.fn(async () => ({ accessToken: silentToken })),
    logout: vi.fn(async () => {}),
  } satisfies SocialLoginClient;
}

/** Fake Google tokeninfo: reports `expiresIn` seconds left, or fails with `status`. */
function fakeTokenInfo({ expiresIn = 1800, status = 200 } = {}) {
  return vi.fn(
    async () =>
      ({
        ok: status < 400,
        status,
        json: async () => ({ expires_in: String(expiresIn) }),
      }) as unknown as Response,
  );
}

function build({
  plugin = fakePlugin(),
  fetchImpl = fakeTokenInfo(),
}: { plugin?: ReturnType<typeof fakePlugin>; fetchImpl?: ReturnType<typeof fakeTokenInfo> } = {}) {
  const auth = createNativeGoogleAuth({
    webClientId: "web-client",
    fetchImpl,
    loadPlugin: async () => plugin,
  });
  return { auth, plugin, fetchImpl };
}

describe("createNativeGoogleAuth", () => {
  describe("requestToken", () => {
    it("asks for Drive access interactively and reports the time the token has left", async () => {
      const { auth, plugin } = build();

      const token = await auth.requestToken({ interactive: true });

      expect(token).toEqual({ access_token: "login-token", expires_in: 1800 });
      const [call] = plugin.login.mock.calls as unknown as [[{ options: { scopes: string[] } }]];
      expect(call[0].options.scopes).toContain(DRIVE_SCOPE);
    });

    it("renews silently without showing the account sheet", async () => {
      const { auth, plugin } = build();

      const token = await auth.requestToken({ interactive: false });

      expect(token).toEqual({ access_token: "silent-token", expires_in: 1800 });
      expect(plugin.refresh).toHaveBeenCalledTimes(1);
      expect(plugin.login).not.toHaveBeenCalled();
    });

    it("checks the token with Google, passing it URL-encoded", async () => {
      const { auth, fetchImpl } = build({ plugin: fakePlugin({ loginToken: "a b&c" }) });
      await auth.requestToken({ interactive: true });
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://oauth2.googleapis.com/tokeninfo?access_token=a%20b%26c",
      );
    });

    it.each([
      ["Google returned no access token", { plugin: fakePlugin({ loginToken: null }) }],
      ["Google says the token is not valid", { fetchImpl: fakeTokenInfo({ status: 400 }) }],
      ["the token has no time left", { fetchImpl: fakeTokenInfo({ expiresIn: 0 }) }],
      [
        "the reported time left is not a number",
        { fetchImpl: fakeTokenInfo({ expiresIn: Number.NaN }) },
      ],
    ])("resolves null when %s", async (_name, options) => {
      const { auth } = build(options);
      expect(await auth.requestToken({ interactive: true })).toBeNull();
    });

    it("resolves null when the plugin's login response has an unexpected shape", async () => {
      const plugin = fakePlugin();
      plugin.login.mockResolvedValueOnce({ provider: "google", result: "surprise" } as never);
      const { auth } = build({ plugin });
      expect(await auth.requestToken({ interactive: true })).toBeNull();
    });

    it("rejects rather than reporting a denied grant when the token check itself fails", async () => {
      const { auth } = build({ fetchImpl: fakeTokenInfo({ status: 503 }) });
      await expect(auth.requestToken({ interactive: true })).rejects.toThrow("503");
    });

    it("initialises the plugin once with the web client id, and retries after a failed start", async () => {
      const plugin = fakePlugin({ initFailures: 1 });
      const { auth } = build({ plugin });

      await expect(auth.requestToken({ interactive: true })).rejects.toThrow("init failed");
      await auth.requestToken({ interactive: true });
      await auth.requestToken({ interactive: false });

      expect(plugin.initialize.mock.calls).toEqual([
        [{ google: { webClientId: "web-client", mode: "online" } }],
        [{ google: { webClientId: "web-client", mode: "online" } }],
      ]);
    });
  });

  describe("signOut", () => {
    it("signs the Google account out on the device", async () => {
      const { auth, plugin } = build();
      await auth.signOut();
      expect(plugin.logout).toHaveBeenCalledWith({ provider: "google" });
    });
  });
});
