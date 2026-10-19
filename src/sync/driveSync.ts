/**
 * Optional cloud sync to the user's own Google Drive.
 *
 * Data lives in the Drive *appDataFolder* — a hidden folder only this OAuth
 * client can read. The browser (or the Android app) talks to Google directly;
 * there is no StepByLearn server or database in the path, so the app's
 * operator has no copy of anyone's courses.
 *
 * Each device writes only its own file (`stepbylearn-<deviceId>.json`) and
 * reads everyone's, keeping the newest version of each record (see
 * driveDocument.ts). Every write resolves only once it has landed in Drive.
 *
 * All I/O is injected so tests run without network, Google's script, timers,
 * randomness or real storage.
 */

import {
  applyOperations,
  DriveSyncError,
  emptyDocument,
  findCompactableFiles,
  isPermanentlyUnreadable,
  isPlainObject,
  latestStamp,
  mergeDeviceDocuments,
  nextStamp,
  parseDeviceDocument,
  parsingDroppedData,
  type DeviceDocument,
  type DeviceFileEntry,
  type MergedView,
  type Operation,
} from "./driveDocument";

const FILE_PREFIX = "stepbylearn-";
const SCOPES = "https://www.googleapis.com/auth/drive.appdata openid email profile";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const LOCK_NAME = "stepbylearn-drive-write";

// Kept in localStorage, not sessionStorage, so a new tab or a reload within the
// token's hour does not demand another click. The token is scoped to this
// app's hidden Drive folder only and expires on Google's side regardless.
const SESSION_KEY = "stepbylearn_drive_session_v1";
const DEVICE_KEY = "stepbylearn_drive_device_v1";

/** Treat a token as expired a little early so no request starts with one about to die. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

/**
 * The Android app renews through the OS, which hands back the *same* token
 * until it has actually expired, so renewal must wait almost to the end.
 */
const NATIVE_TOKEN_EXPIRY_MARGIN_MS = 5_000;

/** The idle-file check runs at most this often, however many reads happen. */
const COMPACTION_MIN_INTERVAL_MS = 60 * 60 * 1000;
/** A pull deletes at most this many idle files; the rest wait for the next pass. */
const MAX_DELETES_PER_PASS = 10;

/** Drive answers 429 and transient 5xx when it is busy; asking again a moment later usually works. */
const MAX_ATTEMPTS = 4;
const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 30_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/** How many device files download at once. */
const DOWNLOAD_CONCURRENCY = 4;

/** After a failed silent renewal, wait this long before trying again on its own. */
const RENEWAL_BACKOFF_MS = 5 * 60_000;

/** Coalesce bursts of edits into one Drive upload. */
const DEFAULT_FLUSH_DELAY_MS = 1500;

export interface DriveUser {
  uid: string;
  email: string;
  displayName: string;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
}

/** The Android app's sign-in (see nativeGoogleAuth); null in a browser, which uses Google's popup. */
export interface NativeAuth {
  requestToken: (options: { interactive: boolean }) => Promise<TokenResponse | null>;
  signOut: () => Promise<void>;
}

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GisTokenClient {
  callback: (response: GisTokenResponse) => void;
  error_callback?: (error: { type?: string; message?: string } | undefined) => void;
  requestAccessToken: (options: { prompt: string; login_hint: string }) => void;
}

/** The slice of Google Identity Services this module uses. */
export interface GoogleIdentity {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: () => void;
      }) => GisTokenClient;
      revoke: (token: string, done: () => void) => void;
    };
  };
}

interface Session {
  accessToken: string | null;
  expiresAt: number;
  user: DriveUser;
  renewalFailedAt?: number | null;
}

interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
}

type DriveInit = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };

export interface DriveSyncDeps {
  /** OAuth Web client ID; empty disables cloud sync. */
  clientId: string;
  fetchImpl: typeof fetch;
  loadGis?: () => Promise<GoogleIdentity>;
  storage?: StorageLike | null;
  /** Per-tab storage (sessionStorage), used for the device id when tabs can't be locked. */
  tabStorage?: StorageLike | null;
  now?: () => number;
  newDeviceId?: () => string;
  withLock?: <T>(task: () => Promise<T>) => Promise<T>;
  /**
   * Share one device id (one file) across tabs. Only safe when `withLock`
   * really excludes other tabs; otherwise two tabs could read-then-write the
   * same file and drop each other's batch, so the id is kept per tab.
   */
  persistDeviceId?: boolean;
  flushDelayMs?: number;
  nativeAuth?: NativeAuth | null;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** A failed request or renewal while the device has no network is "offline", never a sign-out. */
  isOnline?: () => boolean;
}

export interface CollectionSnapshot {
  items: object[];
  /** Ids whose newest version is a delete, so a device holding an old copy can drop it. */
  deletedIds: string[];
}

export interface DriveSync {
  isCloudConfigured: () => boolean;
  /**
   * True when a usable token is stored, or (app only) when an expired one can
   * be renewed silently. In a browser an expired one is not restorable
   * without a click.
   */
  hasRestorableSession: () => boolean;
  /**
   * Reports the connected user on subscribing, then on every change *of who is
   * connected* (a token swap for the same user is not one). In a browser it
   * also starts loading Google's script, so a Connect click can open the popup
   * synchronously.
   */
  onAuthChange: (callback: (user: DriveUser | null) => void) => () => void;
  signInWithGoogle: () => Promise<DriveUser>;
  signOut: () => Promise<void>;
  /**
   * Delete every sync file from the user's Drive and revoke this app's
   * access, then sign out. Google must be reachable *before* anything is
   * deleted: losing the data but keeping the grant would be the worse half.
   */
  deleteAllSyncedData: () => Promise<void>;
  /** Live records plus deleted ids, or null when Drive has never held a record of this collection. */
  loadCollection: (collection: string) => Promise<CollectionSnapshot | null>;
  upsert: (collection: string, item: { id: string }) => Promise<void>;
  remove: (collection: string, id: string) => Promise<void>;
  upsertMany: (collection: string, items: readonly { id: string }[]) => Promise<void>;
}

/** Raised when Google cannot be reached at all: the work is kept and retried once the network is back. */
function offlineError(cause?: unknown): DriveSyncError {
  return new DriveSyncError("Cannot reach Google Drive.", { code: "offline", cause });
}

function readJson(storage: StorageLike | null | undefined, key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: StorageLike | null | undefined, key: string, value: unknown): void {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: the session just will not survive a reload.
  }
}

/** A stored session is external input: ignore anything that isn't the shape we wrote. */
function parseSession(raw: unknown): Session | null {
  if (!isPlainObject(raw) || !isPlainObject(raw.user)) return null;
  const { user } = raw;
  if (typeof user.uid !== "string" || user.uid === "") return null;
  if (typeof raw.expiresAt !== "number" || !Number.isFinite(raw.expiresAt)) return null;
  if (raw.accessToken !== null && typeof raw.accessToken !== "string") return null;
  return {
    accessToken: raw.accessToken,
    expiresAt: raw.expiresAt,
    user: {
      uid: user.uid,
      email: typeof user.email === "string" ? user.email : "",
      displayName: typeof user.displayName === "string" ? user.displayName : "",
    },
    renewalFailedAt: typeof raw.renewalFailedAt === "number" ? raw.renewalFailedAt : null,
  };
}

function browserStorage(kind: "localStorage" | "sessionStorage"): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window[kind] : null;
  } catch {
    return null;
  }
}

function loadGisScript(): Promise<GoogleIdentity> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new DriveSyncError("Google sign-in needs a browser.", { code: "gis-load-failed" }),
    );
  }
  const existing = (window as { google?: GoogleIdentity }).google;
  if (existing?.accounts?.oauth2) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => {
      const loaded = (window as { google?: GoogleIdentity }).google;
      if (loaded) resolve(loaded);
      else
        reject(new DriveSyncError("Could not load Google sign-in.", { code: "gis-load-failed" }));
    };
    script.onerror = () =>
      reject(new DriveSyncError("Could not load Google sign-in.", { code: "gis-load-failed" }));
    document.head.appendChild(script);
  });
}

const hasWebLocks = (): boolean =>
  typeof navigator !== "undefined" && Boolean(navigator.locks?.request);

/**
 * Serialise writes across this browser's tabs: they share one device id and
 * therefore one Drive file. Without Web Locks each tab gets its own device id
 * instead, so there is nothing to serialise across tabs.
 */
function withBrowserLock<T>(task: () => Promise<T>): Promise<T> {
  if (!hasWebLocks()) return task();
  // The DOM lib types the grant callback's result as a nested Promise<Promise<T>>;
  // at runtime request() resolves with exactly what the task resolves with.
  return navigator.locks.request(LOCK_NAME, task) as Promise<T>;
}

/**
 * Run `task` over `items`, at most `limit` at a time, and report each outcome
 * the way Promise.allSettled does, in input order.
 */
async function settleWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { status: "fulfilled", value: await task(items[index] as T) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

interface QueuedWrite {
  op: Operation;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

export function createDriveSync(deps: DriveSyncDeps): DriveSync {
  const {
    clientId,
    fetchImpl,
    loadGis = loadGisScript,
    storage = browserStorage("localStorage"),
    tabStorage = browserStorage("sessionStorage"),
    now = () => Date.now(),
    newDeviceId = () => crypto.randomUUID(),
    withLock = withBrowserLock,
    persistDeviceId = hasWebLocks(),
    flushDelayMs = DEFAULT_FLUSH_DELAY_MS,
    nativeAuth = null,
    sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }),
    random = Math.random,
    isOnline = () => globalThis.navigator?.onLine !== false,
  } = deps;

  let session = parseSession(readJson(storage, SESSION_KEY));
  let gis: GoogleIdentity | null = null;
  let gisLoading: Promise<GoogleIdentity> | null = null;
  let tokenClient: GisTokenClient | null = null;
  let pendingTokenRequest: Promise<TokenResponse> | null = null;
  let pendingRenewal: Promise<string> | null = null;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<(user: DriveUser | null) => void>();

  let queue: QueuedWrite[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let flushChain: Promise<void> = Promise.resolve();
  let ownFileId: string | null = null;
  let latestSeenAt = 0;
  let lastCompactionAt: number | null = null;
  // Files whose last read had entries the parser dropped (see parsingDroppedData).
  const lossyFileIds = new Set<string>();

  // A file whose modifiedTime has not changed since the last pull is not
  // downloaded again. Keyed by file id.
  const documentCache = new Map<string, { modifiedTime: string; document: DeviceDocument }>();
  // Counts uploads, so a read started before one is never handed to a caller
  // that asked after it.
  let writeEpoch = 0;
  let readInFlight: { epoch: number; promise: Promise<MergedView> } | null = null;

  const isConfigured = (): boolean => Boolean(clientId);
  const expiryMargin = nativeAuth ? NATIVE_TOKEN_EXPIRY_MARGIN_MS : TOKEN_EXPIRY_MARGIN_MS;

  const hasValidToken = (): boolean =>
    Boolean(session?.accessToken && session.expiresAt - expiryMargin > now());

  /**
   * Who the header shows as connected. In a browser that is the token's
   * lifetime. In the app a lapsed token is renewed silently, so the user stays
   * connected until a renewal actually fails.
   */
  function currentUser(): DriveUser | null {
    if (!session) return null;
    if (!nativeAuth) return hasValidToken() ? session.user : null;
    return session.renewalFailedAt ? null : session.user;
  }

  /** App only: a stored account whose token can be renewed without UI, outside the post-failure backoff. */
  const canRenewSilently = (): boolean =>
    Boolean(
      nativeAuth &&
      session?.user &&
      (!session.renewalFailedAt || now() - session.renewalFailedAt >= RENEWAL_BACKOFF_MS),
    );

  let device: string | null = null;
  const deviceStorage = persistDeviceId ? storage : tabStorage;

  /** Stable per browser and shared by its tabs; per tab when that is unsafe or storage is blocked. */
  function deviceId(): string {
    if (device) return device;
    const stored = readJson(deviceStorage, DEVICE_KEY);
    device = typeof stored === "string" && stored !== "" ? stored : newDeviceId();
    writeJson(deviceStorage, DEVICE_KEY, device);
    return device;
  }

  /**
   * Leave an unreadable own file where it is (readers skip it) and continue in
   * a new one. Refusing to write forever would strand every later edit locally.
   */
  function abandonOwnFile(): DeviceDocument {
    console.warn("StepByLearn: own Drive sync file is unreadable; continuing in a new one.");
    device = null;
    writeJson(deviceStorage, DEVICE_KEY, null);
    ownFileId = null;
    documentCache.clear();
    return emptyDocument(deviceId());
  }

  const ownFileName = (): string => `${FILE_PREFIX}${deviceId()}.json`;

  let lastReportedUid = currentUser()?.uid ?? null;

  /** Report only a change of *who is connected*; a token swap for the same user must not re-run the app's full merge. */
  function notifyListeners(): void {
    const user = currentUser();
    if ((user?.uid ?? null) === lastReportedUid) return;
    lastReportedUid = user?.uid ?? null;
    for (const listener of listeners) listener(user);
  }

  /**
   * Browser only: tell the header the moment the token lapses, not on the
   * next failed save. The app renews lazily on the next Drive call instead.
   */
  function scheduleExpiryNotice(): void {
    clearTimeout(expiryTimer);
    if (nativeAuth || !session || !hasValidToken()) return;
    expiryTimer = setTimeout(notifyListeners, session.expiresAt - expiryMargin - now());
  }

  function setSession(next: Session | null): void {
    session = next;
    writeJson(storage, SESSION_KEY, next);
    scheduleExpiryNotice();
    notifyListeners();
  }

  function ensureGis(): Promise<GoogleIdentity> {
    if (gis) return Promise.resolve(gis);
    gisLoading ??= loadGis()
      .then((loaded) => {
        gis = loaded;
        return loaded;
      })
      .catch((err: unknown) => {
        gisLoading = null;
        throw err;
      });
    return gisLoading;
  }

  function getTokenClient(loaded: GoogleIdentity): GisTokenClient {
    tokenClient ??= loaded.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: () => {},
    });
    return tokenClient;
  }

  function requireToken(response: TokenResponse | null): TokenResponse {
    if (!response?.access_token) {
      throw new DriveSyncError("Google did not grant access to Drive.", { code: "access_denied" });
    }
    return response;
  }

  /**
   * Ask Google for an access token. When GIS is already loaded this opens the
   * popup synchronously, inside the click that called it — anything later and
   * the browser blocks the popup. That is why GIS is preloaded on startup.
   */
  function requestToken(): Promise<TokenResponse> {
    if (pendingTokenRequest) return pendingTokenRequest;
    if (nativeAuth) {
      pendingTokenRequest = nativeAuth
        .requestToken({ interactive: true })
        .then(requireToken)
        .finally(() => {
          pendingTokenRequest = null;
        });
      return pendingTokenRequest;
    }
    const run = (loaded: GoogleIdentity): Promise<TokenResponse> =>
      new Promise((resolve, reject) => {
        const client = getTokenClient(loaded);
        client.callback = (response) => {
          if (response.error) {
            reject(
              new DriveSyncError(response.error_description || response.error, {
                code: response.error,
              }),
            );
            return;
          }
          resolve(
            requireToken({
              access_token: response.access_token ?? "",
              expires_in: Number(response.expires_in),
            }),
          );
        };
        client.error_callback = (err) => {
          reject(
            new DriveSyncError(err?.message || "Google sign-in was closed.", {
              code: err?.type || "popup_closed",
            }),
          );
        };
        client.requestAccessToken({ prompt: "", login_hint: session?.user.email || "" });
      });
    pendingTokenRequest = (gis ? run(gis) : ensureGis().then(run)).finally(() => {
      pendingTokenRequest = null;
    });
    return pendingTokenRequest;
  }

  const expiredSession = (current: Session): Session => ({
    ...current,
    accessToken: null,
    expiresAt: 0,
  });

  /**
   * App only: renew an expired token for the signed-in user without UI. A
   * failure marks the session so the header offers Connect, and stops every
   * queued save from retrying the OS round-trip until the backoff ends.
   */
  function renewSilently(): Promise<string> {
    const auth = nativeAuth;
    if (!auth)
      return Promise.reject(new DriveSyncError("No silent renewal here.", { code: "signed-out" }));
    pendingRenewal ??= auth
      .requestToken({ interactive: false })
      .then(requireToken)
      .then((response) => {
        if (session) {
          setSession({
            ...session,
            accessToken: response.access_token,
            expiresAt: now() + Number(response.expires_in) * 1000,
            renewalFailedAt: null,
          });
        }
        return response.access_token;
      })
      .catch((err: unknown) => {
        // No network is not a lapsed sign-in: keep the session and try again when it returns.
        if (!isOnline()) throw offlineError(err);
        if (session) setSession({ ...expiredSession(session), renewalFailedAt: now() });
        throw new DriveSyncError("Google Drive session expired.", {
          code: "signed-out",
          cause: err,
        });
      })
      .finally(() => {
        pendingRenewal = null;
      });
    return pendingRenewal;
  }

  async function fetchUser(accessToken: string): Promise<DriveUser> {
    const res = await fetchImpl(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch((err: unknown) => {
      throw offlineError(err);
    });
    if (!res.ok)
      throw new DriveSyncError("Could not read the Google account.", { status: res.status });
    const info = (await res.json()) as { sub?: unknown; email?: unknown; name?: unknown };
    if (typeof info.sub !== "string" || info.sub === "") {
      throw new DriveSyncError("Google returned no account id.", { code: "bad-userinfo" });
    }
    return {
      uid: info.sub,
      email: typeof info.email === "string" ? info.email : "",
      displayName: typeof info.name === "string" ? info.name : "",
    };
  }

  async function signIn(): Promise<DriveUser> {
    if (!isConfigured()) {
      throw new DriveSyncError("Google Drive sync is not configured.", { code: "not-configured" });
    }
    const response = await requestToken();
    const user = await fetchUser(response.access_token);
    if (session?.user.uid !== user.uid) {
      ownFileId = null;
      documentCache.clear();
      latestSeenAt = 0;
    }
    setSession({
      accessToken: response.access_token,
      expiresAt: now() + Number(response.expires_in) * 1000,
      user,
    });
    return user;
  }

  /**
   * Never opens a popup: a background save is not a click, so the browser
   * would block it. In a browser an expired token instead reports "signed
   * out" and the header offers Connect. The app renews the token silently first.
   */
  async function accessToken(): Promise<string> {
    if (session?.accessToken && hasValidToken()) return session.accessToken;
    if (canRenewSilently()) return renewSilently();
    if (!isOnline()) throw offlineError();
    if (session?.accessToken) setSession(expiredSession(session));
    throw new DriveSyncError("Google Drive session expired.", { code: "signed-out" });
  }

  /**
   * Whether asking again can help. A 429 means the request was refused, so any
   * request may repeat. A 5xx may have been applied before it failed, and
   * repeating a file *creation* then could leave two files, so only requests
   * that are safe to repeat (reads, deletes, whole-file uploads) are retried.
   */
  function worthRetrying(status: number, method: string | undefined): boolean {
    if (!RETRYABLE_STATUSES.has(status)) return false;
    return status === 429 || (method ?? "GET") !== "POST";
  }

  /** Exponential, jittered, and never shorter than the Retry-After the server sent. */
  function retryDelayMs(attempt: number, res: Response): number {
    const asked = Number(res.headers?.get?.("Retry-After"));
    const backoff = RETRY_BASE_MS * 2 ** attempt * (0.5 + random());
    return Math.min(RETRY_MAX_MS, Math.max(backoff, Number.isFinite(asked) ? asked * 1000 : 0));
  }

  async function driveFetch(
    url: string,
    init: DriveInit = {},
    retried = false,
    attempt = 0,
  ): Promise<Response> {
    const token = await accessToken();
    const res = await fetchImpl(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    }).catch((err: unknown) => {
      throw offlineError(err);
    });
    if (res.status === 401 && session) {
      // Revoked or expired early: drop the token. A browser then offers to
      // reconnect; the app (still connected) renews and retries once.
      setSession(expiredSession(session));
      if (canRenewSilently() && !retried) return driveFetch(url, init, true, attempt);
    }
    if (!res.ok && attempt < MAX_ATTEMPTS - 1 && worthRetrying(res.status, init.method)) {
      await sleep(retryDelayMs(attempt, res));
      return driveFetch(url, init, retried, attempt + 1);
    }
    if (!res.ok) {
      throw new DriveSyncError(`Google Drive request failed (${res.status}).`, {
        status: res.status,
      });
    }
    return res;
  }

  async function listFiles(query: string, pageToken = ""): Promise<DriveFile[]> {
    const params = new URLSearchParams({
      spaces: "appDataFolder",
      q: query,
      fields: "nextPageToken,files(id,name,modifiedTime)",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const page = (await (await driveFetch(`${DRIVE_API}/files?${params}`)).json()) as {
      files?: DriveFile[];
      nextPageToken?: string;
    };
    const files = page.files ?? [];
    return page.nextPageToken ? [...files, ...(await listFiles(query, page.nextPageToken))] : files;
  }

  async function readFile(id: string): Promise<DeviceDocument> {
    const res = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media`);
    // Read the body first: a connection dropped mid-download must surface as a
    // network error, not be mistaken for a corrupt file and abandoned.
    const text = await res.text().catch((err: unknown) => {
      throw offlineError(err);
    });
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new DriveSyncError("Drive sync file is not valid JSON.", { code: "corrupt-file" });
    }
    const document = parseDeviceDocument(raw);
    if (parsingDroppedData(raw, document)) lossyFileIds.add(id);
    else lossyFileIds.delete(id);
    return document;
  }

  /** The device file's parsed content, from the cache while its modifiedTime has not moved. */
  async function readFileUnlessUnchanged(file: DriveFile): Promise<DeviceDocument> {
    const cached = documentCache.get(file.id);
    if (file.modifiedTime && cached?.modifiedTime === file.modifiedTime) return cached.document;
    const document = await readFile(file.id);
    if (file.modifiedTime)
      documentCache.set(file.id, { modifiedTime: file.modifiedTime, document });
    return document;
  }

  const isSyncFile = (file: DriveFile): boolean =>
    file.name.startsWith(FILE_PREFIX) && file.name.endsWith(".json");

  /**
   * Housekeeping that must never get in the way of a pull: a failure is logged
   * and the read still succeeds. Runs at most once an hour. Each file is looked
   * at again right before its delete, and skipped if anything wrote to it since
   * the pull read it. A 404 means another device removed it first.
   */
  async function deleteIdleFiles(readable: readonly DeviceFileEntry[]): Promise<void> {
    const started = now();
    // A clock that moved backwards must not block the check until it catches up.
    if (
      lastCompactionAt !== null &&
      started >= lastCompactionAt &&
      started - lastCompactionAt < COMPACTION_MIN_INTERVAL_MS
    ) {
      return;
    }
    lastCompactionAt = started;
    try {
      const idle = findCompactableFiles(readable, {
        now: started,
        isOwn: (entry) => entry.id === ownFileId || entry.name === ownFileName(),
      });
      const outcomes = await Promise.allSettled(
        idle.slice(0, MAX_DELETES_PER_PASS).map(async (entry) => {
          const url = `${DRIVE_API}/files/${encodeURIComponent(entry.id)}`;
          const current = (await (await driveFetch(`${url}?fields=modifiedTime`)).json()) as {
            modifiedTime?: string;
          };
          if (current.modifiedTime === entry.modifiedTime) {
            await driveFetch(url, { method: "DELETE" });
          }
        }),
      );
      const failed = outcomes.filter(
        (o) => o.status === "rejected" && (o.reason as { status?: number })?.status !== 404,
      ).length;
      if (failed) console.warn(`StepByLearn: could not remove ${failed} idle Drive sync file(s).`);
    } catch (err) {
      console.warn(
        "StepByLearn: could not check for idle Drive sync files.",
        err instanceof Error ? err.message : "",
      );
    }
  }

  /**
   * Every device's file, merged. A file that can never be read (corrupt,
   * written by a newer version, deleted since the listing) is skipped: one bad
   * file must not stop every device from syncing. Any other failure (network,
   * rate limit, auth) fails the whole read — a merge missing a device's newer
   * edits and deletes would let this device re-upload stale copies over them.
   */
  async function readMergedFresh(): Promise<MergedView> {
    const files = (await listFiles(`name contains '${FILE_PREFIX}'`)).filter(isSyncFile);
    const listed = new Set(files.map((file) => file.id));
    for (const id of documentCache.keys()) if (!listed.has(id)) documentCache.delete(id);

    const results = await settleWithConcurrency(
      files,
      DOWNLOAD_CONCURRENCY,
      readFileUnlessUnchanged,
    );
    const fatal = results.find(
      (r) => r.status === "rejected" && !isPermanentlyUnreadable(r.reason),
    );
    if (fatal && fatal.status === "rejected") throw fatal.reason;
    const skipped = results.filter((r) => r.status === "rejected").length;
    if (skipped) console.warn(`StepByLearn: skipped ${skipped} unreadable Drive sync file(s).`);

    const readable: DeviceFileEntry[] = [];
    files.forEach((file, index) => {
      const result = results[index];
      if (result?.status !== "fulfilled") return;
      readable.push({
        id: file.id,
        name: file.name,
        modifiedTime: file.modifiedTime,
        lossy: lossyFileIds.has(file.id),
        document: result.value,
      });
    });
    const documents = readable.map((entry) => entry.document);
    latestSeenAt = Math.max(latestSeenAt, ...documents.map(latestStamp));
    const merged = mergeDeviceDocuments(documents);
    await deleteIdleFiles(readable);
    return merged;
  }

  /** Concurrent callers share one read; a read from before an upload is never reused after it. */
  function readMerged(): Promise<MergedView> {
    if (readInFlight?.epoch !== writeEpoch) {
      const entry = {
        epoch: writeEpoch,
        promise: readMergedFresh().finally(() => {
          if (readInFlight === entry) readInFlight = null;
        }),
      };
      readInFlight = entry;
    }
    return readInFlight.promise;
  }

  async function readOwnDocument(): Promise<DeviceDocument> {
    if (!ownFileId) {
      const [file] = await listFiles(`name = '${ownFileName()}'`);
      ownFileId = file?.id ?? null;
    }
    if (!ownFileId) return emptyDocument(deviceId());
    try {
      const own = await readFile(ownFileId);
      latestSeenAt = Math.max(latestSeenAt, latestStamp(own));
      return own;
    } catch (err) {
      if (err instanceof DriveSyncError && err.code === "corrupt-file") return abandonOwnFile();
      // Deleted from Drive's "Manage apps → Delete hidden app data": start a new file.
      if (!(err instanceof DriveSyncError) || err.status !== 404) throw err;
      ownFileId = null;
      return emptyDocument(deviceId());
    }
  }

  async function writeOwnDocument(document: DeviceDocument): Promise<void> {
    const body = JSON.stringify(document);
    writeEpoch += 1;
    if (ownFileId) {
      documentCache.delete(ownFileId);
      await driveFetch(
        `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(ownFileId)}?uploadType=media`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body,
        },
      );
      writeEpoch += 1;
      return;
    }
    const boundary = `stepbylearn-${now()}`;
    const metadata = JSON.stringify({ name: ownFileName(), parents: ["appDataFolder"] });
    const multipart = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      metadata,
      `--${boundary}`,
      "Content-Type: application/json",
      "",
      body,
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const res = await driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: multipart,
    });
    const created = (await res.json()) as { id?: unknown };
    if (typeof created.id !== "string") {
      throw new DriveSyncError("Google Drive did not return a file id.", { code: "bad-response" });
    }
    ownFileId = created.id;
    writeEpoch += 1;
  }

  async function flush(): Promise<void> {
    flushTimer = undefined;
    const batch = queue;
    queue = [];
    if (batch.length === 0) return;
    try {
      await withLock(async () => {
        // Re-read under the lock: another tab of this browser shares the file.
        const own = await readOwnDocument();
        const at = nextStamp(now(), latestSeenAt);
        await writeOwnDocument(
          applyOperations(
            own,
            batch.map((entry) => entry.op),
            at,
          ),
        );
        latestSeenAt = at;
      });
      for (const entry of batch) entry.resolve();
    } catch (err) {
      for (const entry of batch) entry.reject(err);
    }
  }

  function scheduleFlush(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushChain = flushChain.then(flush);
    }, flushDelayMs);
  }

  function enqueue(op: Operation): Promise<void> {
    if (!session) {
      return Promise.reject(
        new DriveSyncError("Not connected to Google Drive.", { code: "signed-out" }),
      );
    }
    return new Promise<void>((resolve, reject) => {
      queue.push({ op, resolve, reject });
      scheduleFlush();
    });
  }

  /** Browser: revoke through Google's script, loaded before anything is deleted. */
  async function gisRevoker(): Promise<(token: string) => Promise<void>> {
    const loaded = await ensureGis();
    return (token) =>
      new Promise<void>((resolve) => {
        loaded.accounts.oauth2.revoke(token, () => resolve());
      });
  }

  /**
   * App: Google's script is not used there, so revoke with the plain OAuth
   * endpoint. The files are already gone by now, so a failure only leaves the
   * (now empty) grant in the user's Google account, which they can remove there.
   */
  async function revokeOverHttp(token: string): Promise<void> {
    const res = await fetchImpl(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
    if (!res.ok) console.warn(`StepByLearn: revoking Drive access failed (${res.status})`);
  }

  /** Cancel every queued write, telling each caller it never reached Drive. */
  function dropQueuedWrites(): void {
    clearTimeout(flushTimer);
    flushTimer = undefined;
    const dropped = queue;
    queue = [];
    for (const entry of dropped) {
      entry.reject(new DriveSyncError("Signed out before sync.", { code: "signed-out" }));
    }
  }

  /** Drop queued writes and forget the session; local data is the caller's to clear. */
  function endSession(): void {
    dropQueuedWrites();
    ownFileId = null;
    latestSeenAt = 0;
    lastCompactionAt = null;
    lossyFileIds.clear();
    documentCache.clear();
    writeEpoch += 1;
    setSession(null);
  }

  async function signOutOfDevice(): Promise<void> {
    // Also forget the account on the device, so the next Connect asks again.
    // The app is already signed out locally, so a failure here is not fatal.
    if (!nativeAuth) return;
    await nativeAuth.signOut().catch((err: unknown) => {
      console.warn("StepByLearn: device sign-out failed", err instanceof Error ? err.message : "");
    });
  }

  return {
    isCloudConfigured: isConfigured,

    hasRestorableSession: () => isConfigured() && (hasValidToken() || canRenewSilently()),

    onAuthChange(callback) {
      listeners.add(callback);
      scheduleExpiryNotice();
      const user = isConfigured() ? currentUser() : null;
      lastReportedUid = user?.uid ?? null;
      callback(user);
      if (isConfigured() && !nativeAuth) ensureGis().catch(() => {});
      return () => {
        listeners.delete(callback);
      };
    },

    signInWithGoogle: signIn,

    async signOut() {
      endSession();
      await signOutOfDevice();
    },

    async deleteAllSyncedData() {
      if (!session?.user) {
        throw new DriveSyncError("Not connected to Google Drive.", { code: "signed-out" });
      }
      const revoke = nativeAuth ? revokeOverHttp : await gisRevoker();
      const token = await accessToken();
      dropQueuedWrites();
      await flushChain;
      const files = (await listFiles(`name contains '${FILE_PREFIX}'`)).filter(isSyncFile);
      await Promise.all(
        files.map((file) =>
          driveFetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}`, { method: "DELETE" }),
        ),
      );
      await revoke(session?.accessToken ?? token);
      endSession();
      await signOutOfDevice();
    },

    async loadCollection(collection) {
      const merged = await readMerged();
      const items = merged.collections[collection] ?? [];
      const deletedIds = merged.deleted[collection] ?? [];
      return items.length === 0 && deletedIds.length === 0 ? null : { items, deletedIds };
    },

    upsert: (collection, item) => enqueue({ type: "upsert", collection, item }),

    remove: (collection, id) => enqueue({ type: "delete", collection, id }),

    async upsertMany(collection, items) {
      await Promise.all(items.map((item) => enqueue({ type: "upsert", collection, item })));
    },
  };
}

/** User-facing message for a failed "Connect". */
export function formatSignInError(err: unknown): string {
  const code = err instanceof DriveSyncError ? err.code : "";
  if (code === "popup_failed_to_open")
    return "Popup blocked. Allow popups for this site, then try again.";
  if (code === "popup_closed" || code === "access_denied") return "Sign-in cancelled.";
  if (code === "gis-load-failed")
    return "Could not reach Google. Check your connection or ad blocker.";
  if (code === "not-configured") return "Google Drive sync is not configured for this build.";
  return err instanceof Error && err.message ? err.message : "Sign-in failed.";
}
