# StepByLearn — High-Level Design

## Requirements

- **Functional:**
  - Generate a structured, multi-step learning path for any topic via a user-chosen LLM
    provider (Anthropic, OpenAI, Groq, or Gemini) — `src/services/generation.ts`.
  - Build a path manually without AI — `src/services/manualBuilder.ts`,
    `src/components/screens/ManualBuilderView.tsx`.
  - Track per-step progress and schedule steps onto a calendar —
    `src/services/progress.ts`, `src/services/calendar.ts`.
  - Work fully offline after generation; optionally mirror data to the cloud for
    multi-device access — `src/firebase/pathSync.ts`.
- **Non-functional:**
  - **Privacy-first**: no StepByLearn server exists; the only outbound calls are the
    user's own browser talking directly to their chosen AI provider and (if signed in)
    to Firebase (`docs/HLD.md`'s own source: `src/db/database.ts`'s module docstring,
    `README.md`'s "Privacy & the API key" section).
  - **Offline-capable by construction**: the UI reads only from IndexedDB via Dexie's
    live queries (`useLiveQuery` in `src/App.tsx`), never directly from the network or
    from Firestore.
  - **Provider-swappable**: adding an AI provider means adding one file behind the
    `AIStrategy` interface (`src/ai/strategy.ts`'s own docstring), not touching the
    services layer.

## Static view

```
components → services → { ai, repositories } → domain
                              ↑
                          firebase (optional cloud mirror, one direction: Dexie ↔ Firestore)
```

(The dependency direction above is stated in README.md's own "Architecture" section and
confirmed by import chains — e.g. `src/services/generation.ts` imports from `src/ai/*`,
`src/repositories/*`, and `src/domain/*`, never the reverse.)

- **`src/domain`** — framework-free types (`types.ts`) and id generation (`ids.ts`); the one
  shape every layer agrees on, per `types.ts`'s own module docstring.
- **`src/db` + `src/repositories`** — `db/database.ts` defines the Dexie (IndexedDB) schema
  (`paths`, `settings` tables); `repositories/pathRepository.ts` and
  `repositories/settingsRepository.ts` are the only modules that touch it directly, so
  swapping storage means replacing this layer alone (`database.ts`'s own docstring).
- **`src/ai`** — `resolver.ts` builds an `AIStrategy` (`strategy.ts`) per provider, backed by
  the shared `@joka-7/modeldispatcher-browser-agent` package (also used by
  JobFlowTracker/KanDOne/HighFive, per `resolver.ts`'s docstring); `prompts.ts` builds the
  LLM prompts; `jsonHealer.ts` repairs fragile model output into validated domain shapes.
- **`src/firebase`** — optional cloud mirror. `config.ts` initializes the Firebase app from
  env vars (never hardcoded — see Config management below); `auth.ts` handles sign-in;
  `pathSync.ts` is a bidirectional Dexie ↔ Firestore sync with last-write-wins conflict
  resolution (see Dynamic view).
- **`src/services`** — use-cases: `generation.ts` (AI-driven path creation),
  `manualBuilder.ts` (no-AI path creation), `calendar.ts` (scheduling), `progress.ts`
  (completion tracking).
- **`src/components`** — React UI. `App.tsx` is the shell (sidebar + top bar + view switch);
  `components/screens/*` are the five views (`Dashboard`, `Study`, `Calendar`, `Analytics`,
  `ManualBuilder`); `components/layout/*` is the sidebar/top bar chrome.
- **`legacy-python/`** — an earlier FastAPI + SQLite implementation of the same concept,
  kept for reference per `README.md`'s "Legacy Python implementation" section; not part of
  the running app.

Full annotated file list: [`STRUCTURE.md`](STRUCTURE.md).

## Dynamic view

**Primary flow — AI-generated path** (`src/services/generation.ts`):

1. UI calls `generatePath` (or the additional-steps/fix-step variants) with the topic and
   options (step duration, content type, learner background).
2. `resolveStrategy` (`src/ai/resolver.ts`) looks up the configured provider + API key via
   `settingsRepository.getSettings`/`getApiKey`, and throws `MissingApiKeyError`
   (`src/ai/strategy.ts`) if none is set.
3. A prompt is built (`src/ai/prompts.ts`) and sent through the resolved `AIStrategy`,
   which calls `@joka-7/modeldispatcher-browser-agent`'s `complete()` directly from the
   browser — no StepByLearn backend is in this path at all.
4. The raw text reply is repaired and validated by `healAndValidate`/`healAndValidateSteps`
   (`src/ai/jsonHealer.ts`) into real `LearningPath`/`PathStep` domain objects.
5. The result is persisted via `pathRepository.savePath`/`appendSteps` in one IndexedDB
   write (`generation.ts`'s own docstring: "inherently atomic").
6. The UI never polls — `useLiveQuery` (Dexie) re-renders automatically once the write
   lands.

**Secondary flow — cloud sync** (`src/firebase/pathSync.ts`): a bidirectional mirror between
Dexie's `paths` table and `users/{uid}/paths` in Firestore. The UI only ever reads/writes
Dexie; sync runs underneath. Conflict resolution is last-write-wins by `updatedAt`, guarded
by a `lastSynced` map that records which `updatedAt` this engine itself last wrote in either
direction — without it, writing a pulled-down doc back into Dexie would be seen by the local
watcher and immediately re-pushed (the loop `pathSync.ts`'s own docstring calls out
explicitly).

## Data storage

- **Primary store**: browser IndexedDB via Dexie (`src/db/database.ts`) — two tables,
  `paths` (each a full `LearningPath` document with steps embedded) and `settings` (a
  singleton row for provider preferences). No server-side database exists.
- **Cache**: none beyond IndexedDB itself; Dexie's live queries make the UI reactive
  without a separate cache layer.
- **Blob storage**: none — the app has no user-uploaded files.
- **Cloud mirror (optional)**: Firestore, one subcollection per signed-in user
  (`users/{uid}/paths`), populated only by `pathSync.ts`; this is a mirror of the local
  store, not the primary store.
- **Backup/DR**: none built — local-first by design means the user's own browser is the
  only copy unless cloud sync is enabled. Not documented anywhere in the repo as a gap to
  fill; noted here as an honest absence rather than an oversight to paper over.

## Config management

- **AI provider API key**: user-supplied, stored in `localStorage` (per README.md's
  "Privacy & the API key" section) — never an env var, never bundled, never sent anywhere
  but the chosen provider's own API.
- **Firebase project config**: Vite env vars (`VITE_FIREBASE_*`, read in
  `src/firebase/config.ts`), not hardcoded — `config.ts`'s own docstring: these are
  "not secrets" per Firebase's guidance (access control is Firestore security rules + Auth,
  not config secrecy), but are still env-sourced so the same build works for local dev and
  the Vercel deployment without editing source.
- **Fail-soft, not fail-fast, on missing cloud config**: when the Firebase env vars are
  absent, `firebaseConfigured` becomes `false` and callers must treat cloud sync as
  unavailable (`config.ts`'s own docstring) — a deliberate deviation from a hard fail-fast
  startup, since Firebase is optional and the app's core (offline, local-first) use case
  must keep working with zero config.
- `cleanEnvVar` (`config.ts`) defensively trims and unquotes every env var, because
  Vercel's env-var UI is a real, named source of accidentally-pasted whitespace/quotes that
  otherwise breaks Google sign-in with an opaque error (`config.ts`'s own comment).

## Data validation / I/O

- All AI output is treated as untrusted text, never parsed JSON directly: `jsonHealer.ts`
  is a defense-in-depth cleaner (strips code fences, prose, stray text) before validating
  into the real `LearningPath`/`PathStep` shapes defined in `src/domain/types.ts`.
- Domain types are the single validated shape every layer shares — persisted as-is in
  IndexedDB and returned from the AI layer only after validation (`types.ts`'s own
  docstring).

## Integration test strategy

- `src/ai/jsonHealer.test.ts` and `src/ai/resolver.test.ts` cover the AI layer's most
  fragile boundary (untrusted model output) in isolation.
- `src/services/progress.test.ts` covers the progress use-case.
- `src/firebase/config.test.ts` covers env-var cleaning/config resolution.
- `src/domain/ids.test.ts` covers id generation.
- Run via `npm test` (Vitest); `npm run test:watch` for the loop. No end-to-end/browser
  test suite exists in this repo at the time of writing — noted as an honest gap, not
  invented as present.
