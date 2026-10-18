# StepByLearn — Low-Level Design

Every claim below traces to a real file; see [`HLD.md`](HLD.md) for the layer this
implements and why it's shaped this way.

## Class / interface contracts

- **`AIStrategy`** (`src/ai/strategy.ts`) — the one contract every provider implements:
  `generateText(prompt: string, system: string): Promise<string>`. Prompt building and JSON
  healing live outside it, so adding a provider never touches `services/*`.
- **Domain types** (`src/domain/types.ts`) — `LearningPath`, `PathStep`, `LearningResource`,
  `Difficulty`, `StepStatus`, `ContentType`, plus `LegacyAppSettings` (read once for
  migration). Framework-free; the one shape every layer agrees on.
- **`StepByLearnDB`** (`src/db/database.ts`, extends `Dexie`) — `paths`
  (`Table<LearningPath, string>`, indexed `id, createdAt`) and the legacy `settings` table.
  Steps are embedded on their parent path document.
- **`PathStore`** (`src/sync/pathStore.ts`) — what the sync engine needs from local storage:
  `listAll()` (including tombstones), `putIfNewer(paths)` (one transaction; returns what was
  actually written) and `subscribe(onChange, onError)`. `dexiePathStore` is the real
  implementation; tests pass an in-memory one.
- **`DriveSync`** (`src/sync/driveSync.ts`) — the Drive client's public surface:
  `isCloudConfigured`, `hasRestorableSession`, `onAuthChange`, `signInWithGoogle`, `signOut`,
  `deleteAllSyncedData`, `loadCollection`, `upsert`, `upsertMany`, `remove`. Built by
  `createDriveSync(deps)`, where every dependency (fetch, Google's script loader, storage,
  clock, device id, lock, sleep, randomness, online check, native sign-in) is injectable.
- **`NativeAuth`** (`src/sync/driveSync.ts`) — `requestToken({ interactive })` returning
  `{ access_token, expires_in } | null`, and `signOut()`. `createNativeGoogleAuth`
  (`src/sync/nativeGoogleAuth.ts`) implements it over the `@capgo/capacitor-social-login`
  plugin (an injectable `SocialLoginClient`): interactive asks Android for the Drive scope;
  silent calls `refresh` then `getAuthorizationCode`; expiry comes from Google's `tokeninfo`
  endpoint because the plugin doesn't report it (a 400 means invalid → `null`; any other
  failure rejects, so it is never mistaken for "access denied").
- **`startPathDriveSync(deps)`** (`src/sync/pathDriveSync.ts`) — `{ sync, store, onStatus,
triggers?, now? }` in, a stop function out.

## Pseudocode

**Transactional update** (`pathRepository.updatePath`) — every step edit, append and
scheduling pass goes through it, so a concurrent write can't be overwritten by a stale copy:

```
updatePath(pathId, mutate):
  within a Dexie rw-transaction on `paths`:
    path = parseStoredPath(db.paths.get(pathId))      # validates and backfills legacy rows
    if not path or path.deletedAt != null: return undefined
    updated = mutate(path) with updatedAt = now()
    db.paths.put(updated); return updated
```

**Sync engine** (`pathDriveSync.startPathDriveSync`) — one queue; pulls and pushes never
interleave:

```
reconcile():                                  # at start, on visible, on network back
  remote = parse(loadCollection("paths").items)           # invalid items skipped
  local  = store.listAll()
  plan   = planSync(local, remote)                        # newer updatedAt wins, per course
  lastSynced[c] = c.updatedAt  for c in plan.pull          # BEFORE writing, so no echo
  store.putIfNewer(plan.pull except tombstones for courses not held locally)
  lastSynced[c] = c.updatedAt  for c in plan.inSync
  push(plan.push)                                         # upsertMany(toWire(c))
  first time only: start the local watcher

local watcher (after the first reconcile):
  changed = snapshot.filter(c => c.updatedAt > (lastSynced[c.id] ?? ""))   # strictly newer
  push(changed)

push(courses):
  lastSynced[c] = c.updatedAt;  upsertMany(...)
  on failure: forget lastSynced for them so the next pull or change retries, then rethrow
toWire(c) = c if live, else a slim tombstone (no title, topic, description, steps)
```

**Drive merge and write stamp** (`driveDocument.ts`):

```
mergeDeviceDocuments(docs):  per (collection, id) keep the entry with the greater `at`;
                             on a tie the greater `device` id; item == null means deleted
nextStamp(now, latestSeen) = max(now, latestSeen + 1)    # a slow clock can't lose to a fast one
flush(batch):  under a cross-tab lock: read own file; at = nextStamp(...);
               write applyOperations(own, batch, at)     # create via multipart, else PATCH
```

## I/O schemas

- **`LearningPath`** (`src/domain/types.ts`): `{ id, title, topic, description, difficulty,
estimatedHours, modelName, stepDuration, contentType, currentKnowledge, steps: PathStep[],
createdAt, updatedAt, deletedAt: string | null }`.
- **`PathStep`**: `{ id, orderIndex, title, duration, type, description, keyConcepts,
materialTitle, materialUrl, resources: LearningResource[], status, doneAt, scheduledDate,
isMilestone }`.
- **Drive device file** (`stepbylearn-<deviceId>.json`, `DeviceDocument` in
  `src/sync/driveDocument.ts`): `{ version: 1, device, collections: { paths: { [id]: { item:
LearningPath | null, at: number } } } }`. `item: null` is a Drive-level delete; deleted
  courses are synced as live entries whose item has `deletedAt` set and no content.
  Version other than 1 is rejected as `unsupported-version`.
- **AI provider call**: `AIStrategy.generateText(prompt, system) -> Promise<string>` — a raw
  string, deliberately untyped further, since it is untrusted until healed.
- **`SyncStatus`** (`pathDriveSync.ts`): `syncing | synced | offline | error{message}`.

## Config keys

| Key                                                       | Read in                                    | Default when absent                                                                                    |
| --------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `VITE_GOOGLE_CLIENT_ID` (env)                             | `src/sync/clientId.ts`                     | `""` → `isCloudConfigured()` is false; the connect button is hidden; the rest of the app is unaffected |
| `localStorage["stepbylearn_drive_session_v1"]`            | `src/sync/driveSync.ts`                    | no session; shape-checked on read, anything else is ignored                                            |
| `localStorage["stepbylearn_drive_device_v1"]`             | `src/sync/driveSync.ts`                    | a new device id; kept per tab in `sessionStorage` when Web Locks are unavailable                       |
| `capacitor.config.json`                                   | `cap sync` / `cap add`                     | `appId` `io.github.joka7.stepbylearn`, `appName` `StepByLearn`, `webDir` `dist`                        |
| `-PversionCode` / `-PversionName` (Gradle)                | `android/app/build.gradle`                 | `1` / `1.0`; CI passes the run number so each APK installs over the last                               |
| `localStorage["stepbylearn.syncOwner"]`                   | `src/sync/dataOwner.ts`                    | `null` — courses created before any sign-in                                                            |
| AI provider list (`modeldispatcher-browser-agent` config) | `src/repositories/settingsRepository.ts`   | no providers → `resolveStrategy` throws `MissingApiKeyError`                                           |
| Dexie `settings` singleton row (legacy)                   | `settingsRepository.migrateLegacySettings` | ignored unless there is no provider config yet; read once, never written                               |

## Android app

`android/` is the Capacitor template plus four deliberate changes: the launcher and splash
images (generated from `public/icons/icon-512.png`), version code/name from Gradle
properties, `allowBackup="false"`, and `MainActivity`, which hands Google's Drive-consent
result back to the SocialLogin plugin (without it the plugin can't request any scope beyond
sign-in). The token margin differs by platform: the browser treats a token as expired 60 s
early, the app only 5 s early, because Android returns the same token until it has really
expired (`driveSync.ts`: `NATIVE_TOKEN_EXPIRY_MARGIN_MS`). A failed silent renewal marks the
session as signed-out and is not retried for 5 minutes (`RENEWAL_BACKOFF_MS`), unless the
device is simply offline, which never signs the user out. The web build is copied into
`android/app/src/main/assets/public` by `cap sync` and is gitignored with the other generated
files. The APK is built, aligned, signed with `apksigner` and verified by
`.github/workflows/android.yml`. The native code has not been compiled, and the app has not
been run on a device, from this repository's history yet.

## DI wiring

There is no DI container. Pure logic takes its I/O as arguments: `createDriveSync(deps)`,
`startPathDriveSync(deps)` and `PathStore` all receive their collaborators, which is what lets
the tests run without a network, clock, Google or IndexedDB. The composition root is small and
explicit: `src/sync/drive.ts` builds the one real `DriveSync` from the environment, and
`src/hooks/useCloudSync.ts` passes it, plus `dexiePathStore`, to `startPathDriveSync`.
`src/main.tsx` mounts `ErrorBoundary` and `ToastProvider` around `App`; `src/App.tsx` reads
the provider config, runs `useCloudSync`, and wires the five screens to the repository-backed
`useLiveQuery`. Services (`generation.ts`, `manualBuilder.ts`, `calendar.ts`) import the
repository and AI resolver as plain functions.

## Error contract

Expected failures return a value; unexpected ones throw a named `Error` subclass:

- **Return values:** repositories return `undefined` for "not found" (`getPath`,
  `updatePath`, `updateStep`, `appendSteps`); `parseStoredPath` returns `null` for a value
  that can't be a path, and callers skip it.
- **Thrown, typed:** `MissingApiKeyError` (`ai/strategy.ts`), `JsonHealingError` (carries the
  raw output; `ai/jsonHealer.ts`), `InvalidScheduleError` (`services/calendar.ts`), and
  `DriveSyncError` (`sync/driveDocument.ts`) with a numeric `status` and a string `code`
  (`offline`, `signed-out`, `corrupt-file`, `unsupported-version`, `not-configured`,
  `access_denied`, `popup_closed`, `gis-load-failed`, …).
- **Sync failure policy:** a Drive file that can never be read (404, corrupt, newer version) is
  skipped; any other read failure (network, rate limit, auth) fails the whole pull, because
  merging without a device's newer edits and deletes would let this device re-upload stale
  copies (`driveSync.ts`, `readMergedFresh`). `offline` is never treated as a sign-out.
- **UI boundary:** `ErrorBoundary` shows a recovery screen for render errors; action failures
  surface as toasts (`components/ui/ToastProvider.tsx`).
- The contract is still mixed (return values and thrown errors), by design for the first
  group; it is not a single `Result` type.

## Logging plan

No structured logging: this is a client-only app with no server to aggregate logs, and no
logging library is a dependency. `console.warn` / `console.error` are used sparingly for
skipped invalid records and sync failures, and carry only an error name, status or code —
never tokens, request bodies or course content (checked in `pathDriveSync.test.ts`).

## Unit test plan

`npm test` (Vitest; timezone pinned to `Asia/Jerusalem` in `vitest.config.ts`). Mirrors the
source tree; scenarios for one function are table-driven in its group:

- `src/ai/jsonHealer.test.ts`, `src/ai/resolver.test.ts` — untrusted model output and provider
  resolution.
- `src/domain/dates.test.ts`, `ids.test.ts`, `urls.test.ts`, `storedPath.test.ts` — local-day
  math, ids, link-scheme filtering, validation and backfill of stored paths.
- `src/repositories/pathRepository.test.ts` — against `fake-indexeddb`: soft delete and undo,
  tombstone purge, transactional updates under concurrency, legacy-row backfill.
- `src/services/calendar.test.ts`, `progress.test.ts` — scheduling and streaks.
- `src/sync/driveDocument.test.ts` — parsing, merge, tie-breaks, clock guard, idle-file rules.
- `src/sync/driveSync.test.ts` — the client against a fake Drive and fake Google sign-in
  (browser and Android paths, retries, offline, caching, cleanup, delete-all).
- `src/sync/nativeGoogleAuth.test.ts` — the Android token flow against a fake plugin and fake
  tokeninfo endpoint.
- `src/sync/syncPlan.test.ts`, `pathStore.test.ts`, `pathDriveSync.test.ts`, `clientId.test.ts`
  — the conflict rule, the real Dexie store, the engine (including two devices through one
  fake Drive) and env cleaning.
- `e2e/smoke.spec.ts` (Playwright, `npm run test:e2e`) — boots the real app, creates a
  course, survives a reload, undoes a delete, and checks dialog accessibility.
  `e2e/screenshots.spec.ts` only regenerates README images and skips under CI.

Mocking targets are the true I/O edges: the network (`fetch`), Google's script, storage
adapters, the clock and the AI provider. Dexie is not mocked; `fake-indexeddb` stands in for
the browser. Not covered: React components in isolation, and the real Google sign-in popup
(needs a real OAuth client).
