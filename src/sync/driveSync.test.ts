import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DriveSyncError, STALE_DEVICE_FILE_MS } from "./driveDocument";
import {
  createDriveSync,
  formatSignInError,
  type DriveSync,
  type DriveUser,
  type GoogleIdentity,
  type NativeAuth,
  type StorageLike,
} from "./driveSync";

const NOW = 1_700_000_000_000;
const USER = { sub: "google-sub-1", email: "user@example.com", name: "Dana Levi" };
const SESSION_KEY = "stepbylearn_drive_session_v1";
const DEVICE_KEY = "stepbylearn_drive_device_v1";
const PREFIX = "stepbylearn-";

interface FakeFile {
  name: string;
  body: string;
  modifiedTime?: string;
}

type Records = Record<string, { item: { id: string; title?: string } | null; at: number }>;

const deviceFile = (device: string, paths: Records = {}): FakeFile => ({
  name: `${PREFIX}${device}.json`,
  body: JSON.stringify({ version: 1, device, collections: { paths } }),
});

interface GoogleOptions {
  files?: Record<string, FakeFile>;
  failWith?: number | null;
  pageLimit?: number;
  failRead?: Record<string, number | "network">;
  flaky?: { times: number; status: number; method?: string; retryAfter?: string } | null;
  revokedTokens?: string[];
}

/** In-memory stand-in for the Drive v3 + userinfo + revoke endpoints this module calls. */
function fakeGoogle({
  files = {},
  failWith = null,
  pageLimit = Infinity,
  failRead = {},
  flaky = null,
  revokedTokens = [],
}: GoogleOptions = {}) {
  const state = {
    files: { ...files },
    nextId: 1,
    patched: [] as string[],
    created: [] as string[],
    deleted: [] as string[],
    listings: 0,
    reads: [] as string[],
    clock: 0,
    active: 0,
    maxActive: 0,
    offline: false,
    revoked: null as string | null,
    userinfoFails: false,
  };
  // Files without their own modifiedTime get an increasing one, as Drive would give them.
  const touch = (file: FakeFile): FakeFile => {
    file.modifiedTime = new Date(NOW + ++state.clock).toISOString();
    return file;
  };
  Object.values(state.files).forEach((file) => {
    if (!file.modifiedTime) touch(file);
  });

  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    ({
      ok: status < 400,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: { get: (name: string) => headers[name] ?? null },
    }) as unknown as Response;
  const raw = (text: string) =>
    ({ ok: true, status: 200, text: async () => text }) as unknown as Response;
  let flakyLeft = flaky?.times ?? 0;

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const headers = (init.headers ?? {}) as Record<string, string>;
    if (state.offline) throw new TypeError("Failed to fetch");
    if (failWith) return json({}, failWith);
    if (
      flaky &&
      flakyLeft > 0 &&
      !url.includes("openidconnect") &&
      (!flaky.method || (init.method ?? "GET") === flaky.method)
    ) {
      flakyLeft -= 1;
      return json({}, flaky.status, flaky.retryAfter ? { "Retry-After": flaky.retryAfter } : {});
    }
    if (revokedTokens.some((t) => headers.Authorization === `Bearer ${t}`)) return json({}, 401);
    if (url === "https://oauth2.googleapis.com/revoke") {
      state.revoked = new URLSearchParams(String(init.body)).get("token");
      return json({});
    }
    if (url === "https://openidconnect.googleapis.com/v1/userinfo") {
      return state.userinfoFails ? json({}, 500) : json(USER);
    }
    if (url.includes("/upload/drive/v3/files?uploadType=multipart")) {
      const parts = String(init.body).split("\r\n");
      const id = `new-${state.nextId++}`;
      state.files[id] = touch({
        name: (JSON.parse(parts[3] ?? "{}") as { name: string }).name,
        body: parts[7] ?? "",
      });
      state.created.push(id);
      return json({ id });
    }
    const patch = url.match(/\/upload\/drive\/v3\/files\/([^?]+)\?uploadType=media/);
    if (patch) {
      const file = state.files[patch[1] ?? ""];
      if (!file) return json({}, 404);
      file.body = String(init.body);
      touch(file);
      state.patched.push(patch[1] ?? "");
      return json({});
    }
    const del = init.method === "DELETE" ? url.match(/\/drive\/v3\/files\/([^?]+)$/) : null;
    if (del) {
      const id = del[1] ?? "";
      if (!state.files[id]) return json({}, 404);
      delete state.files[id];
      state.deleted.push(id);
      return json({}, 204);
    }
    if (url.startsWith("https://www.googleapis.com/drive/v3/files?")) {
      state.listings += 1;
      const params = new URL(url).searchParams;
      const exact = params.get("q")?.match(/^name = '(.+)'$/)?.[1];
      const list = Object.entries(state.files)
        .filter(([, f]) => (exact ? f.name === exact : f.name.startsWith(PREFIX)))
        .map(([id, f]) => ({ id, name: f.name, modifiedTime: f.modifiedTime }));
      const start = Number(params.get("pageToken") || 0);
      const end = start + Math.min(pageLimit, Number(params.get("pageSize")));
      return json(
        end < list.length
          ? { files: list.slice(start, end), nextPageToken: String(end) }
          : { files: list.slice(start) },
      );
    }
    const modified = url.match(/\/drive\/v3\/files\/([^?]+)\?fields=modifiedTime/);
    if (modified) {
      const file = state.files[modified[1] ?? ""];
      return file ? json({ modifiedTime: file.modifiedTime }) : json({}, 404);
    }
    const media = url.match(/\/drive\/v3\/files\/([^?]+)\?alt=media/);
    if (media) {
      const id = media[1] ?? "";
      state.reads.push(id);
      state.active += 1;
      state.maxActive = Math.max(state.maxActive, state.active);
      for (let tick = 0; tick < 3; tick += 1) await Promise.resolve();
      state.active -= 1;
      const failure = failRead[id];
      if (failure === "network") {
        return {
          ok: true,
          status: 200,
          text: async () => {
            throw new TypeError("network error");
          },
        } as unknown as Response;
      }
      if (failure) return json({}, failure);
      const file = state.files[id];
      return file ? raw(file.body) : json({}, 404);
    }
    throw new Error(`unexpected request ${url}`);
  });

  const stored = (id: string) =>
    JSON.parse(state.files[id]?.body ?? "null") as {
      device: string;
      collections: { paths?: Records };
    };
  return { state, fetchImpl, stored };
}

function fakeGis({ error = null as string | null } = {}) {
  const revoke = vi.fn((_token: string, done: () => void) => done());
  const client = {
    callback: vi.fn<(response: unknown) => void>(),
    requestAccessToken: vi.fn(() => {
      if (error) client.callback({ error });
      else client.callback({ access_token: "token-1", expires_in: 3600 });
    }),
  };
  const gis = {
    accounts: { oauth2: { initTokenClient: vi.fn(() => client), revoke } },
  } as unknown as GoogleIdentity;
  return { gis, client, revoke };
}

function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
}

function session(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    accessToken: "token-1",
    expiresAt: NOW + 3_600_000,
    user: { uid: USER.sub, email: USER.email, displayName: USER.name },
    ...overrides,
  });
}

const signedIn = () => memoryStorage({ [SESSION_KEY]: session() });
const expired = () =>
  memoryStorage({ [SESSION_KEY]: session({ accessToken: null, expiresAt: 0 }) });

/** Stand-in for the Android sign-in: hands out `app-token-1`, `app-token-2`, … */
function fakeNativeAuth({ silent = "grant", interactive = "grant" } = {}) {
  let issued = 0;
  const grant = (mode: string) => {
    if (mode === "fail") return Promise.reject(new Error("needs the user"));
    if (mode === "none") return Promise.resolve(null);
    issued += 1;
    return Promise.resolve({ access_token: `app-token-${issued}`, expires_in: 3600 });
  };
  return {
    requestToken: vi.fn(({ interactive: isInteractive }: { interactive: boolean }) =>
      grant(isInteractive ? interactive : silent),
    ),
    signOut: vi.fn(async () => {}),
  } satisfies NativeAuth;
}

interface BuildOptions {
  google?: ReturnType<typeof fakeGoogle>;
  gis?: ReturnType<typeof fakeGis>;
  storage?: StorageLike;
  clientId?: string;
  withLock?: <T>(task: () => Promise<T>) => Promise<T>;
  persistDeviceId?: boolean;
  deviceIds?: string[];
  tabStorage?: StorageLike;
  nativeAuth?: NativeAuth | null;
  isOnline?: () => boolean;
}

function build({
  google = fakeGoogle(),
  gis = fakeGis(),
  storage = memoryStorage(),
  clientId = "client-id",
  withLock = (task) => task(),
  persistDeviceId = true,
  deviceIds = ["this", "next"],
  tabStorage = memoryStorage(),
  nativeAuth = null,
  isOnline = () => true,
}: BuildOptions = {}) {
  const ids = [...deviceIds];
  const sleeps: number[] = [];
  const sync: DriveSync = createDriveSync({
    clientId,
    fetchImpl: google.fetchImpl,
    loadGis: async () => gis.gis,
    storage,
    tabStorage,
    now: () => Date.now(),
    newDeviceId: () => ids.shift() ?? "exhausted",
    withLock,
    persistDeviceId,
    flushDelayMs: 100,
    nativeAuth,
    isOnline,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
  });
  return { sync, google, gis, storage, sleeps };
}

/** Let the debounce fire and the queued Drive round-trips finish. */
const settle = () => vi.advanceTimersByTimeAsync(150);

/** Start a write and let it land; returns its settled outcome. */
async function write(promise: Promise<void>): Promise<PromiseSettledResult<void>> {
  const outcome = Promise.allSettled([promise]).then(([r]) => r as PromiseSettledResult<void>);
  await settle();
  return outcome;
}

const item = (id: string, title = id) => ({ id, title });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createDriveSync (browser)", () => {
  describe("signInWithGoogle", () => {
    it("stores the session and reports the user to listeners", async () => {
      const { sync, storage } = build();
      const seen: (DriveUser | null)[] = [];
      sync.onAuthChange((u) => seen.push(u));

      const user = await sync.signInWithGoogle();

      expect(user).toEqual({ uid: USER.sub, email: USER.email, displayName: USER.name });
      expect(seen).toEqual([null, user]);
      expect(JSON.parse(storage.getItem(SESSION_KEY) ?? "{}")).toMatchObject({
        accessToken: "token-1",
        expiresAt: NOW + 3_600_000,
      });
    });

    it("opens the Google popup synchronously once the script has preloaded, so the click is not blocked", async () => {
      const gis = fakeGis();
      const { sync } = build({ gis });
      sync.onAuthChange(() => {});
      await vi.advanceTimersByTimeAsync(0);

      const pending = sync.signInWithGoogle();
      // No awaiting between the "click" and the popup request.
      expect(gis.client.requestAccessToken).toHaveBeenCalledTimes(1);
      await pending;
    });

    it.each([
      ["Google reports an error", { gis: fakeGis({ error: "access_denied" }) }, "access_denied"],
      ["sync has no client id", { clientId: "" }, "not-configured"],
    ])("rejects with a typed code when %s", async (_name, options, code) => {
      const { sync } = build(options);
      await expect(sync.signInWithGoogle()).rejects.toMatchObject({ code });
    });

    it("does not store a session when the account lookup fails", async () => {
      const google = fakeGoogle();
      google.state.userinfoFails = true;
      const { sync, storage } = build({ google });
      await expect(sync.signInWithGoogle()).rejects.toBeInstanceOf(DriveSyncError);
      expect(storage.getItem(SESSION_KEY)).toBeNull();
    });
  });

  describe("onAuthChange / hasRestorableSession", () => {
    it("reports a stored session only while its token is valid, and its expiry when it lapses", async () => {
      const { sync } = build({ storage: signedIn() });
      const seen: (string | null)[] = [];
      sync.onAuthChange((u) => seen.push(u?.uid ?? null));
      expect(seen).toEqual([USER.sub]);

      await vi.advanceTimersByTimeAsync(3_600_000);

      expect(seen).toEqual([USER.sub, null]);
    });

    it.each([
      ["a valid token", signedIn, true],
      ["an expired token (a browser can't renew without a click)", expired, false],
      ["no session", () => memoryStorage(), false],
      [
        "a corrupt stored session",
        () => memoryStorage({ [SESSION_KEY]: JSON.stringify({ user: "nope" }) }),
        false,
      ],
    ])("hasRestorableSession with %s", (_name, storage, expected) => {
      expect(build({ storage: storage() }).sync.hasRestorableSession()).toBe(expected);
    });

    it("is not restorable, and reports nobody, when sync is not configured", () => {
      const { sync } = build({ storage: signedIn(), clientId: "" });
      const seen: unknown[] = [];
      sync.onAuthChange((u) => seen.push(u));
      expect(sync.hasRestorableSession()).toBe(false);
      expect(seen).toEqual([null]);
    });
  });

  describe("writes", () => {
    it("coalesces a burst into one upload of this device's own file, then PATCHes it", async () => {
      const { sync, google } = build({ storage: signedIn() });

      const first = Promise.all([sync.upsert("paths", item("a")), sync.upsert("paths", item("b"))]);
      await settle();
      await first;
      expect(google.state.created).toHaveLength(1);
      expect(Object.keys(google.stored("new-1").collections.paths ?? {}).sort()).toEqual([
        "a",
        "b",
      ]);

      const second = sync.upsert("paths", item("c"));
      await settle();
      await second;
      expect(google.state.patched).toEqual(["new-1"]);
      expect(Object.keys(google.stored("new-1").collections.paths ?? {}).sort()).toEqual([
        "a",
        "b",
        "c",
      ]);
    });

    it("rejects a write made while signed out, without touching Drive", async () => {
      const { sync, google } = build();
      await expect(sync.upsert("paths", item("a"))).rejects.toMatchObject({ code: "signed-out" });
      expect(google.fetchImpl).not.toHaveBeenCalled();
    });

    it("recreates its file when Drive no longer has it", async () => {
      const { sync, google } = build({ storage: signedIn() });
      const first = sync.upsert("paths", item("a"));
      await settle();
      await first;
      delete google.state.files["new-1"];

      const second = sync.upsert("paths", item("b"));
      await settle();
      await second;

      expect(google.state.created).toHaveLength(2);
      expect(Object.keys(google.stored("new-2").collections.paths ?? {})).toEqual(["b"]);
    });

    it("leaves an unreadable own file untouched and continues in a new one", async () => {
      const google = fakeGoogle({
        files: { broken: { name: `${PREFIX}this.json`, body: "{not json" } },
      });
      const { sync } = build({
        google,
        storage: memoryStorage({ [SESSION_KEY]: session(), [DEVICE_KEY]: JSON.stringify("this") }),
        deviceIds: ["next"],
      });

      const outcome = await write(sync.upsert("paths", item("a")));

      expect(outcome.status).toBe("fulfilled");
      expect(google.state.files.broken?.body).toBe("{not json");
      expect(google.state.created).toHaveLength(1);
      expect(google.stored("new-1").device).toBe("next");
    });

    it("stamps a write after the newest entry in Drive, even if another device's clock runs ahead", async () => {
      const ahead = NOW + 60 * 60 * 1000;
      const google = fakeGoogle({
        files: { other: deviceFile("zzz", { a: { item: item("a", "theirs"), at: ahead } }) },
      });
      const { sync } = build({ google, storage: signedIn() });
      await sync.loadCollection("paths");

      const outcome = await write(sync.upsert("paths", item("a", "mine")));
      expect(outcome.status).toBe("fulfilled");

      expect(google.stored("new-1").collections.paths?.a?.at).toBe(ahead + 1);
      const snapshot = await sync.loadCollection("paths");
      expect(snapshot?.items).toEqual([item("a", "mine")]);
    });

    it("shares one device file across tabs only when tabs can be locked, and keeps it across a reload", async () => {
      const shared = signedIn();
      const tab = memoryStorage();
      const a = build({
        storage: shared,
        tabStorage: tab,
        persistDeviceId: true,
        deviceIds: ["id-1"],
      });
      await write(a.sync.upsert("paths", item("a")).catch(() => {}));
      expect(shared.getItem(DEVICE_KEY)).toBe(JSON.stringify("id-1"));
      expect(tab.getItem(DEVICE_KEY)).toBeNull();

      const sharedNoLocks = signedIn();
      const tabNoLocks = memoryStorage();
      const b = build({
        storage: sharedNoLocks,
        tabStorage: tabNoLocks,
        persistDeviceId: false,
        deviceIds: ["id-2"],
      });
      await write(b.sync.upsert("paths", item("a")).catch(() => {}));
      expect(sharedNoLocks.getItem(DEVICE_KEY)).toBeNull();
      expect(tabNoLocks.getItem(DEVICE_KEY)).toBe(JSON.stringify("id-2"));
    });
  });

  describe("remove / tombstones", () => {
    it("hides the record even though another device still holds an older copy", async () => {
      const google = fakeGoogle({
        files: { other: deviceFile("other", { a: { item: item("a"), at: NOW - 10 } }) },
      });
      const { sync } = build({ google, storage: signedIn() });

      const outcome = await write(sync.remove("paths", "a"));
      expect(outcome.status).toBe("fulfilled");

      const snapshot = await sync.loadCollection("paths");
      expect(snapshot).toEqual({ items: [], deletedIds: ["a"] });
    });

    it("lets a later edit on any device bring a deleted record back", async () => {
      const google = fakeGoogle({
        files: {
          a: deviceFile("a", { x: { item: null, at: NOW - 5 } }),
          b: deviceFile("b", { x: { item: item("x", "back"), at: NOW - 1 } }),
        },
      });
      const { sync } = build({ google, storage: signedIn() });
      expect((await sync.loadCollection("paths"))?.items).toEqual([item("x", "back")]);
    });
  });

  describe("loadCollection", () => {
    it("is null when Drive has never held a record (first sign-in)", async () => {
      const { sync } = build({ storage: signedIn() });
      expect(await sync.loadCollection("paths")).toBeNull();
    });

    it("merges every device's file, newest entry per record winning", async () => {
      const google = fakeGoogle({
        files: {
          a: deviceFile("a", {
            x: { item: item("x", "old"), at: 1 },
            y: { item: item("y"), at: 1 },
          }),
          b: deviceFile("b", { x: { item: item("x", "new"), at: 2 } }),
        },
      });
      const { sync } = build({ google, storage: signedIn() });
      const snapshot = await sync.loadCollection("paths");
      expect(snapshot?.items).toEqual(expect.arrayContaining([item("x", "new"), item("y")]));
      expect(snapshot?.items).toHaveLength(2);
    });

    it("reads every page of the file listing", async () => {
      const files: Record<string, FakeFile> = {};
      for (let i = 0; i < 5; i += 1) {
        files[`f${i}`] = deviceFile(`d${i}`, { [`r${i}`]: { item: item(`r${i}`), at: i + 1 } });
      }
      const google = fakeGoogle({ files, pageLimit: 2 });
      const { sync } = build({ google, storage: signedIn() });
      expect((await sync.loadCollection("paths"))?.items).toHaveLength(5);
      expect(google.state.listings).toBe(3);
    });

    it("ignores unrelated files in the app folder", async () => {
      const google = fakeGoogle({
        files: {
          other: { name: "something-else.json", body: "{}" },
          mine: deviceFile("d", { a: { item: item("a"), at: 1 } }),
        },
      });
      const { sync } = build({ google, storage: signedIn() });
      expect((await sync.loadCollection("paths"))?.items).toEqual([item("a")]);
      expect(google.state.reads).toEqual(["mine"]);
    });

    it.each([
      ["a corrupt file", { name: `${PREFIX}bad.json`, body: "not json" }, undefined],
      [
        "a file written by a newer version",
        {
          name: `${PREFIX}new.json`,
          body: JSON.stringify({ version: 9, device: "n", collections: {} }),
        },
        undefined,
      ],
      ["a file deleted since the listing", deviceFile("gone"), 404 as const],
    ])("skips %s instead of failing every device's sync", async (_name, bad, failure) => {
      const google = fakeGoogle({
        files: { good: deviceFile("good", { a: { item: item("a"), at: 1 } }), bad },
        failRead: failure ? { bad: failure } : {},
      });
      const { sync } = build({ google, storage: signedIn() });
      expect((await sync.loadCollection("paths"))?.items).toEqual([item("a")]);
    });

    it.each([
      ["a transient server error", 500 as const],
      ["a rate limit that persists", 429 as const],
      ["a dropped connection mid-download", "network" as const],
    ])(
      "fails the whole pull on %s rather than merging without a device's newer edits",
      async (_name, failure) => {
        const google = fakeGoogle({
          files: {
            good: deviceFile("good", { a: { item: item("a"), at: 1 } }),
            flaky: deviceFile("flaky", { a: { item: null, at: 2 } }),
          },
          failRead: { flaky: failure },
        });
        const { sync } = build({ google, storage: signedIn() });
        await expect(sync.loadCollection("paths")).rejects.toBeInstanceOf(DriveSyncError);
      },
    );

    it("signs the user out when Google rejects the token", async () => {
      const google = fakeGoogle({ revokedTokens: ["token-1"] });
      const { sync } = build({ google, storage: signedIn() });
      const seen: (string | null)[] = [];
      sync.onAuthChange((u) => seen.push(u?.uid ?? null));

      await expect(sync.loadCollection("paths")).rejects.toMatchObject({ status: 401 });

      expect(seen).toEqual([USER.sub, null]);
      expect(sync.hasRestorableSession()).toBe(false);
    });
  });

  describe("rate limits and errors", () => {
    it.each([
      ["429", 429, "GET"],
      ["503 on a read", 503, "GET"],
    ])("retries a %s with backoff and then succeeds", async (_name, status, method) => {
      const google = fakeGoogle({ flaky: { times: 2, status, method } });
      const { sync, sleeps } = build({ google, storage: signedIn() });
      await expect(sync.loadCollection("paths")).resolves.toBeNull();
      expect(sleeps).toEqual([500, 1000]);
    });

    it("waits at least as long as Retry-After asks", async () => {
      const google = fakeGoogle({ flaky: { times: 1, status: 429, retryAfter: "7" } });
      const { sync, sleeps } = build({ google, storage: signedIn() });
      await sync.loadCollection("paths");
      expect(sleeps).toEqual([7000]);
    });

    it("gives up after a few attempts and reports the status", async () => {
      const google = fakeGoogle({ flaky: { times: 99, status: 503 } });
      const { sync, sleeps } = build({ google, storage: signedIn() });
      await expect(sync.loadCollection("paths")).rejects.toMatchObject({ status: 503 });
      expect(sleeps).toHaveLength(3);
    });

    it("does not retry an error that will not change", async () => {
      const google = fakeGoogle({ failWith: 403 });
      const { sync, sleeps } = build({ google, storage: signedIn() });
      await expect(sync.loadCollection("paths")).rejects.toMatchObject({ status: 403 });
      expect(sleeps).toEqual([]);
    });

    it("does not repeat a file creation after a 5xx, which may already have created it", async () => {
      const google = fakeGoogle({ flaky: { times: 1, status: 503, method: "POST" } });
      const { sync } = build({ google, storage: signedIn() });
      const outcome = await write(sync.upsert("paths", item("a")));
      expect(outcome.status).toBe("rejected");
      expect(google.state.created).toHaveLength(0);
    });
  });

  describe("working offline", () => {
    it("reports an unreachable Drive as offline, not as a sign-in problem", async () => {
      const google = fakeGoogle();
      google.state.offline = true;
      const { sync } = build({ google, storage: signedIn() });
      await expect(sync.loadCollection("paths")).rejects.toMatchObject({ code: "offline" });
      expect(sync.hasRestorableSession()).toBe(true);
    });

    it("tells a browser with a lapsed token that it is offline while it is, and signed out once it is not", async () => {
      let online = false;
      const { sync } = build({ storage: expired(), isOnline: () => online });
      await expect(sync.loadCollection("paths")).rejects.toMatchObject({ code: "offline" });
      online = true;
      await expect(sync.loadCollection("paths")).rejects.toMatchObject({ code: "signed-out" });
    });
  });

  describe("pull cost", () => {
    it("shares one read between pulls started together", async () => {
      const google = fakeGoogle({
        files: { a: deviceFile("a", { x: { item: item("x"), at: 1 } }) },
      });
      const { sync } = build({ google, storage: signedIn() });
      await Promise.all([sync.loadCollection("paths"), sync.loadCollection("paths")]);
      expect(google.state.listings).toBe(1);
      expect(google.state.reads).toHaveLength(1);
    });

    it("downloads only the files that changed since the last pull", async () => {
      const google = fakeGoogle({
        files: {
          a: deviceFile("a", { x: { item: item("x"), at: 1 } }),
          b: deviceFile("b", { y: { item: item("y"), at: 1 } }),
        },
      });
      const { sync } = build({ google, storage: signedIn() });
      await sync.loadCollection("paths");
      google.state.reads.length = 0;

      const b = google.state.files.b;
      if (!b) throw new Error("fixture");
      b.body = deviceFile("b", { y: { item: item("y", "edited"), at: 2 } }).body;
      b.modifiedTime = new Date(NOW + 999).toISOString();
      await sync.loadCollection("paths");

      expect(google.state.reads).toEqual(["b"]);
    });

    it("never serves a stale copy of a file this device just rewrote", async () => {
      const { sync } = build({ storage: signedIn() });
      const first = sync.upsert("paths", item("a", "v1"));
      await settle();
      await first;
      expect((await sync.loadCollection("paths"))?.items).toEqual([item("a", "v1")]);

      const second = sync.upsert("paths", item("a", "v2"));
      await settle();
      await second;
      expect((await sync.loadCollection("paths"))?.items).toEqual([item("a", "v2")]);
    });

    it("does not keep cached files after signing out", async () => {
      const google = fakeGoogle({
        files: { a: deviceFile("a", { x: { item: item("x"), at: 1 } }) },
      });
      const { sync, storage } = build({ google, storage: signedIn() });
      await sync.loadCollection("paths");
      await sync.signOut();
      storage.setItem(SESSION_KEY, session());
      const again = build({ google, storage });
      google.state.reads.length = 0;
      await again.sync.loadCollection("paths");
      expect(google.state.reads).toEqual(["a"]);
    });

    it("limits how many files download at once", async () => {
      const files: Record<string, FakeFile> = {};
      for (let i = 0; i < 10; i += 1) files[`f${i}`] = deviceFile(`d${i}`);
      const google = fakeGoogle({ files });
      const { sync } = build({ google, storage: signedIn() });
      await sync.loadCollection("paths");
      expect(google.state.maxActive).toBeLessThanOrEqual(4);
      expect(google.state.maxActive).toBeGreaterThan(1);
    });
  });

  describe("compacting idle device files", () => {
    const OLD = new Date(NOW - STALE_DEVICE_FILE_MS - 60_000).toISOString();
    const idle = (device: string, paths: Records): FakeFile => ({
      ...deviceFile(device, paths),
      modifiedTime: OLD,
    });
    // A fresh file so "idle" is measured against a recent Drive write.
    const fresh = (paths: Records): FakeFile => ({
      ...deviceFile("fresh", paths),
      modifiedTime: new Date(NOW - 1_000).toISOString(),
    });

    it("deletes a file idle for 90 days whose every record is older elsewhere, and changes nothing anyone sees", async () => {
      const google = fakeGoogle({
        files: {
          stale: idle("stale", { x: { item: item("x", "old"), at: 1 } }),
          fresh: fresh({ x: { item: item("x", "new"), at: 2 } }),
        },
      });
      const { sync } = build({ google, storage: signedIn() });
      const before = await sync.loadCollection("paths");
      await vi.advanceTimersByTimeAsync(0);
      expect(google.state.deleted).toEqual(["stale"]);
      google.state.reads.length = 0;
      const after = await sync.loadCollection("paths");
      expect(after?.items).toEqual(before?.items);
    });

    it("keeps an idle file that holds the newest copy of any record", async () => {
      const google = fakeGoogle({
        files: {
          stale: idle("stale", { x: { item: item("x", "newest"), at: 9 } }),
          fresh: fresh({ x: { item: item("x", "older"), at: 2 } }),
        },
      });
      await build({ google, storage: signedIn() }).sync.loadCollection("paths");
      expect(google.state.deleted).toEqual([]);
    });

    it("does not delete a file that was written to after the pull read it", async () => {
      const google = fakeGoogle({
        files: {
          stale: idle("stale", { x: { item: item("x", "old"), at: 1 } }),
          fresh: fresh({ x: { item: item("x", "new"), at: 2 } }),
        },
      });
      const original = google.fetchImpl.getMockImplementation();
      google.fetchImpl.mockImplementation(async (input, init) => {
        // A device writes to the stale file between the pull's read and the delete.
        if (String(input).includes("stale?fields=modifiedTime")) {
          const file = google.state.files.stale;
          if (file) file.modifiedTime = new Date(NOW).toISOString();
        }
        return original ? original(input, init) : fetch(input, init);
      });
      await build({ google, storage: signedIn() }).sync.loadCollection("paths");
      expect(google.state.deleted).toEqual([]);
    });

    it("deletes at most ten files per pass, and checks at most once an hour", async () => {
      const files: Record<string, FakeFile> = { fresh: fresh({ z: { item: item("z"), at: 99 } }) };
      for (let i = 0; i < 14; i += 1) files[`s${i}`] = idle(`s${i}`, {});
      const google = fakeGoogle({ files });
      // Outlives the test's simulated hours, so a lapsed token isn't what stops it.
      const { sync } = build({
        google,
        storage: memoryStorage({ [SESSION_KEY]: session({ expiresAt: NOW + 10 * 3_600_000 }) }),
      });

      await sync.loadCollection("paths");
      expect(google.state.deleted).toHaveLength(10);

      await vi.advanceTimersByTimeAsync(30 * 60_000);
      await sync.loadCollection("paths");
      expect(google.state.deleted).toHaveLength(10);

      await vi.advanceTimersByTimeAsync(31 * 60_000);
      await sync.loadCollection("paths");
      expect(google.state.deleted).toHaveLength(14);
    });

    it("still completes the pull when Drive refuses the delete, and says so", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const google = fakeGoogle({
        files: {
          stale: idle("stale", { x: { item: item("x", "old"), at: 1 } }),
          fresh: fresh({ x: { item: item("x", "new"), at: 2 } }),
        },
      });
      const original = google.fetchImpl.getMockImplementation();
      google.fetchImpl.mockImplementation(async (input, init) =>
        init?.method === "DELETE"
          ? ({ ok: false, status: 403, headers: { get: () => null } } as unknown as Response)
          : (original?.(input, init) as Promise<Response>),
      );
      const { sync } = build({ google, storage: signedIn() });
      expect((await sync.loadCollection("paths"))?.items).toEqual([item("x", "new")]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("could not remove 1 idle"));
      warn.mockRestore();
    });
  });

  describe("signOut", () => {
    it("drops queued writes and forgets the session", async () => {
      const { sync, storage, google } = build({ storage: signedIn() });
      const queued = sync.upsert("paths", item("a"));
      const outcome = Promise.allSettled([queued]);
      await sync.signOut();
      await settle();
      expect((await outcome)[0]?.status).toBe("rejected");
      expect(storage.getItem(SESSION_KEY)).toBeNull();
      expect(google.state.created).toHaveLength(0);
    });

    it("clears the session so a different account starts clean", async () => {
      const { sync } = build({ storage: signedIn() });
      const seen: (string | null)[] = [];
      sync.onAuthChange((u) => seen.push(u?.uid ?? null));
      await sync.signOut();
      expect(seen).toEqual([USER.sub, null]);
    });
  });

  describe("deleteAllSyncedData", () => {
    it("deletes every device file, revokes the Google grant and signs out, leaving unrelated files alone", async () => {
      const google = fakeGoogle({
        files: {
          a: deviceFile("a"),
          b: deviceFile("b"),
          other: { name: "keep-me.json", body: "{}" },
        },
      });
      const gis = fakeGis();
      const { sync, storage } = build({ google, gis, storage: signedIn() });

      await sync.deleteAllSyncedData();

      expect(google.state.deleted.sort()).toEqual(["a", "b"]);
      expect(google.state.files.other).toBeDefined();
      expect(gis.revoke).toHaveBeenCalledWith("token-1", expect.any(Function));
      expect(storage.getItem(SESSION_KEY)).toBeNull();
    });

    it("deletes nothing when Google cannot be reached to revoke access afterwards", async () => {
      const google = fakeGoogle({ files: { a: deviceFile("a") } });
      const sync = createDriveSync({
        clientId: "client-id",
        fetchImpl: google.fetchImpl,
        loadGis: async () => {
          throw new DriveSyncError("Could not load Google sign-in.", { code: "gis-load-failed" });
        },
        storage: signedIn(),
        tabStorage: memoryStorage(),
        now: () => Date.now(),
      });
      await expect(sync.deleteAllSyncedData()).rejects.toMatchObject({ code: "gis-load-failed" });
      expect(google.state.deleted).toEqual([]);
    });

    it("fails without deleting when not connected to Drive", async () => {
      const google = fakeGoogle({ files: { a: deviceFile("a") } });
      const { sync } = build({ google });
      await expect(sync.deleteAllSyncedData()).rejects.toMatchObject({ code: "signed-out" });
      expect(google.state.deleted).toEqual([]);
    });
  });
});

describe("createDriveSync (Android app)", () => {
  it("signs in through Android, never loading Google's browser script", async () => {
    const nativeAuth = fakeNativeAuth();
    const loadGis = vi.fn(async () => fakeGis().gis);
    const sync = createDriveSync({
      clientId: "client-id",
      fetchImpl: fakeGoogle().fetchImpl,
      loadGis,
      storage: memoryStorage(),
      tabStorage: memoryStorage(),
      nativeAuth,
    });
    sync.onAuthChange(() => {});
    const user = await sync.signInWithGoogle();
    expect(user.uid).toBe(USER.sub);
    expect(nativeAuth.requestToken).toHaveBeenCalledWith({ interactive: true });
    expect(loadGis).not.toHaveBeenCalled();
  });

  it("rejects when Android returns no Drive token", async () => {
    const { sync } = build({ nativeAuth: fakeNativeAuth({ interactive: "none" }) });
    await expect(sync.signInWithGoogle()).rejects.toMatchObject({ code: "access_denied" });
  });

  it("treats an expired stored session as restorable, since the app can renew it", () => {
    const { sync } = build({ storage: expired(), nativeAuth: fakeNativeAuth() });
    expect(sync.hasRestorableSession()).toBe(true);
  });

  it("reports the user once through a lapsed token and its silent renewals", async () => {
    const nativeAuth = fakeNativeAuth();
    const { sync } = build({ storage: expired(), nativeAuth });
    const seen: (string | null)[] = [];
    sync.onAuthChange((u) => seen.push(u?.uid ?? null));

    await sync.loadCollection("paths");
    expect(nativeAuth.requestToken).toHaveBeenCalledWith({ interactive: false });
    await vi.advanceTimersByTimeAsync(3_600_000);
    await sync.loadCollection("paths");

    expect(seen).toEqual([USER.sub]);
  });

  it("keeps using a token in its last minute, because Android only renews one that has really expired", async () => {
    const nativeAuth = fakeNativeAuth();
    const { sync } = build({ storage: signedIn(), nativeAuth });
    await vi.advanceTimersByTimeAsync(3_600_000 - 30_000);
    await sync.loadCollection("paths");
    expect(nativeAuth.requestToken).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(26_000);
    await sync.loadCollection("paths");
    expect(nativeAuth.requestToken).toHaveBeenCalledTimes(1);
  });

  it("reports signed out when renewal fails, and does not retry it on every save until the backoff ends", async () => {
    const nativeAuth = fakeNativeAuth({ silent: "fail" });
    const { sync } = build({ storage: expired(), nativeAuth });
    const seen: (string | null)[] = [];
    sync.onAuthChange((u) => seen.push(u?.uid ?? null));

    await expect(sync.loadCollection("paths")).rejects.toMatchObject({ code: "signed-out" });
    await expect(sync.loadCollection("paths")).rejects.toMatchObject({ code: "signed-out" });
    expect(nativeAuth.requestToken).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([USER.sub, null]);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await expect(sync.loadCollection("paths")).rejects.toMatchObject({ code: "signed-out" });
    expect(nativeAuth.requestToken).toHaveBeenCalledTimes(2);
  });

  it("keeps the session when renewal fails only because the device is offline", async () => {
    const nativeAuth = fakeNativeAuth({ silent: "fail" });
    const { sync } = build({ storage: expired(), nativeAuth, isOnline: () => false });
    await expect(sync.loadCollection("paths")).rejects.toMatchObject({ code: "offline" });
    expect(sync.hasRestorableSession()).toBe(true);
  });

  it("renews and retries once when Google rejects a token early", async () => {
    const google = fakeGoogle({ revokedTokens: ["old-token"] });
    const nativeAuth = fakeNativeAuth();
    const { sync } = build({
      google,
      storage: memoryStorage({
        [SESSION_KEY]: session({ accessToken: "old-token" }),
      }),
      nativeAuth,
    });
    await expect(sync.loadCollection("paths")).resolves.toBeNull();
    expect(nativeAuth.requestToken).toHaveBeenCalledWith({ interactive: false });
  });

  it("also signs the account out on the device", async () => {
    const nativeAuth = fakeNativeAuth();
    const { sync } = build({ storage: signedIn(), nativeAuth });
    await sync.signOut();
    expect(nativeAuth.signOut).toHaveBeenCalledTimes(1);
  });

  it("deletes the files, revokes over HTTP without Google's browser script and signs out on the device", async () => {
    const google = fakeGoogle({ files: { a: deviceFile("a") } });
    const nativeAuth = fakeNativeAuth();
    const loadGis = vi.fn(async () => fakeGis().gis);
    const sync = createDriveSync({
      clientId: "client-id",
      fetchImpl: google.fetchImpl,
      loadGis,
      storage: signedIn(),
      tabStorage: memoryStorage(),
      nativeAuth,
      now: () => Date.now(),
    });

    await sync.deleteAllSyncedData();

    expect(google.state.deleted).toEqual(["a"]);
    expect(google.state.revoked).toBe("token-1");
    expect(loadGis).not.toHaveBeenCalled();
    expect(nativeAuth.signOut).toHaveBeenCalledTimes(1);
  });
});

describe("formatSignInError", () => {
  it.each([
    ["popup_failed_to_open", "Popup blocked. Allow popups for this site, then try again."],
    ["popup_closed", "Sign-in cancelled."],
    ["access_denied", "Sign-in cancelled."],
    ["gis-load-failed", "Could not reach Google. Check your connection or ad blocker."],
    ["not-configured", "Google Drive sync is not configured for this build."],
  ])("maps %s to a readable message", (code, message) => {
    expect(formatSignInError(new DriveSyncError("raw", { code }))).toBe(message);
  });

  it.each([
    ["an unknown code keeps its own message", new DriveSyncError("Boom", { code: "x" }), "Boom"],
    ["a plain error keeps its message", new Error("Plain"), "Plain"],
    ["a non-error falls back", "nope", "Sign-in failed."],
  ])("%s", (_name, err, message) => {
    expect(formatSignInError(err)).toBe(message);
  });
});
