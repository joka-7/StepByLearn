# StepByLearn — Low-Level Design

Every claim below traces to a real file; see [`HLD.md`](HLD.md) for the layer this
implements and why it's shaped this way.

## Class / interface contracts

- **`AIStrategy`** (`src/ai/strategy.ts`) — the one contract every provider implements:
  `generateText(prompt: string, system: string): Promise<string>`. Prompt building and
  JSON healing live outside it deliberately, so adding a provider means adding one file
  behind this interface, never touching `services/*`.
- **Domain types** (`src/domain/types.ts`) — `LearningPath`, `PathStep`,
  `LearningResource`, `AppSettings`, `Difficulty`, `StepStatus`, `ContentType`. Framework-
  free; the one shape every layer (Dexie, the AI layer's validated output, the UI) agrees
  on.
- **`StepByLearnDB`** (`src/db/database.ts`, extends `Dexie`) — two tables: `paths`
  (`Table<LearningPath, string>`, indexed `id, createdAt`) and `settings`
  (`Table<AppSettings, string>`, a singleton row). Steps are embedded on their parent path
  document rather than a third table — `database.ts`'s own comment: "only two stores are
  needed."

## Pseudocode

**`updateStep` transaction** (`src/repositories/pathRepository.ts`) — the one place a
concurrent-edit race is possible, so it's worth spelling out:
```
updateStep(pathId, stepId, mutate):
  within a Dexie rw-transaction on `paths`:
    raw = db.paths.get(pathId)
    if not raw: return undefined
    path = normalizePath(raw)                    # backfill legacy-schema fields
    updated = path with steps[stepId] replaced by mutate(steps[stepId])
    updated.updatedAt = now()
    db.paths.put(updated)
    return updated
```
The transaction wraps read-mutate-write so a second concurrent `updateStep` can't
interleave and clobber the first (Dexie's transaction gives this for free; the function
would otherwise be a classic read-modify-write race over two separate IndexedDB calls).

**Cloud sync loop-prevention** (`src/firebase/pathSync.ts`) — the non-obvious part of an
otherwise ordinary bidirectional mirror:
```
on local path change (Dexie watcher):
  if path.updatedAt != lastSynced[path.id]:
    push to Firestore
    lastSynced[path.id] = path.updatedAt

on remote path change (Firestore listener):
  if remote.updatedAt != lastSynced[path.id] and remote.updatedAt > local.updatedAt:
    write remote into Dexie
    lastSynced[path.id] = remote.updatedAt        # set BEFORE the local watcher fires
```
Setting `lastSynced` before the Dexie write completes is what stops the local watcher
(triggered by the very write this pull just made) from seeing it as a new local change and
pushing it straight back up — the loop `pathSync.ts`'s own docstring names explicitly.

## I/O schemas

- **`PathStep`** (`src/domain/types.ts`): `{ id, orderIndex, title, description, type:
  ContentType, duration, status: StepStatus, keyConcepts: string[], materialTitle,
  materialUrl, resources: LearningResource[] }`.
- **`LearningPath`**: `{ id, createdAt, updatedAt, topic, stepDuration, contentType,
  currentKnowledge, steps: PathStep[] }` (exact optional/backfilled fields per
  `pathRepository.ts`'s `normalizePath`/`normalizeStep` — see Error contract below).
- **`AppSettings`**: `{ id: "singleton", provider: ProviderId, models: Record<ProviderId,
  string> }`.
- **AI provider call**: `AIStrategy.generateText(prompt, system) -> Promise<string>` — a
  raw string, deliberately not typed further, since the whole point of `jsonHealer.ts` is
  that this raw text is untrusted until healed.

## Config keys

| Key | Read in | Default when absent |
|---|---|---|
| `VITE_FIREBASE_*` (API key, project id, etc.) | `src/firebase/config.ts` | `firebaseConfigured = false`; cloud sync disabled, rest of app unaffected |
| `localStorage["stepbylearn.apiKey.<provider>"]` | `src/repositories/settingsRepository.ts` (`getApiKey`/`setApiKey`) | `null` — `resolveStrategy` throws `MissingApiKeyError` |
| Dexie `settings` singleton row (`id: "singleton"`) | `settingsRepository.getSettings` | `DEFAULT_SETTINGS` (provider `"anthropic"`, `defaultModels()`) materialized on first read, not written until `saveSettings` is called |

## DI wiring

No DI container — this is a small browser app, and every "wiring" point is an ordinary
function import: `services/generation.ts` imports `ai/resolver.resolveStrategy`,
`repositories/pathRepository.*`, and `repositories/settingsRepository.*` directly.
`src/App.tsx` is the closest thing to a composition root: it reads settings
(`getSettings`/`hasApiKey`), starts cloud sync (`startPathSync`), and wires the five screen
components to the repository-backed `useLiveQuery` data. There is no hidden
`new SomeService()` inside business logic to flag — every dependency is a plain function
from another module.

## Error contract

- **Ordinary `Error` subclasses, not a discriminated union**: `MissingApiKeyError`
  (`src/ai/strategy.ts`) is the one named error type in the codebase. Other failure paths
  (a repository call finding nothing) return `undefined` rather than throwing — e.g.
  `getPath`, `updateStep`, `appendSteps` all return `LearningPath | undefined`. This is a
  mixed contract (thrown errors for "can't proceed at all", `undefined` for "not found") —
  worth normalizing if the error surface grows, noted here rather than glossed over.
- **Legacy-schema tolerance is itself an error-handling strategy**: `normalizeStep`/
  `normalizePath` (`pathRepository.ts`) backfill fields that may be missing from data
  written by an older app version, specifically to avoid the alternative — a crash on
  `undefined.map()` the moment the UI touches a field that didn't exist yet (the
  function's own docstring). This is defensive reads, not defensive writes: new data is
  always written in the current shape; only reads tolerate the old one.

## Logging plan

No structured logging exists in this codebase — it is a client-only app with no server to
aggregate logs on, and no logging library is a dependency (`package.json` has none). Errors
surface directly to the user (e.g. `MissingApiKeyError`'s message is user-facing: "Add one
in Settings"). Noted as the actual state, not a gap dressed up as a plan: a purely local,
single-user tool has limited use for structured server-side logging in the first place.

## Unit test plan

Existing (`npm test`, Vitest):
- `src/ai/jsonHealer.test.ts` — the untrusted-AI-output boundary, the highest-value place
  to test given `jsonHealer.ts` exists specifically to handle malformed model output.
- `src/ai/resolver.test.ts` — provider strategy resolution.
- `src/services/progress.test.ts` — progress-tracking use-case.
- `src/firebase/config.test.ts` — env var cleaning (`cleanEnvVar`) and `firebaseConfigured`
  resolution.
- `src/domain/ids.test.ts` — id generation.

Mocking targets, per the app's own boundaries: the AI provider call (`AIStrategy`) and
Firestore are the true I/O edges and are the right place to mock; Dexie itself is not
mocked in the existing suite (IndexedDB via `fake-indexeddb` or similar would be the
addition if repository-level tests are added later — not present today, noted as a gap
rather than invented).
