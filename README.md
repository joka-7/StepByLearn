# StepByLearn

An **offline-first, cloud-AI, step-by-step learning platform** — a pure browser
web app. Generate a structured learning path for any topic with the Anthropic
Claude API, schedule it onto a calendar, and track your progress. Everything is
stored locally in your browser (IndexedDB) for privacy and full offline use.

No backend, no server, no database to install. Just `npm install && npm run dev`.

## Highlights

- **Pure web app** — Vite + React + TypeScript. Runs from `npm run dev` or
  deploys as a static site to any host (Netlify, Vercel, GitHub Pages, S3…).
- **Local-first storage** — all paths, steps, calendar dates, and progress live
  in the browser's **IndexedDB** (via Dexie). Nothing is sent to a server.
- **Cloud AI** — generation calls the **Anthropic Claude API directly from the
  browser** using a key you paste into Settings (stored only in your browser).
- **Resilient parsing** — a defense-in-depth JSON healer cleans fragile model
  output (code fences, prose, stray text) into validated domain models.
- **Fully offline after generation** — browsing paths, marking steps done,
  scheduling, and progress/streaks all work with no network.

## Architecture

Layered with a single direction of dependency:

```
components → services → { ai, repositories } → domain
```

- `src/domain` — pure types + id generation (no I/O).
- `src/db` + `src/repositories` — Dexie/IndexedDB persistence behind repository
  functions (swap storage without touching the rest).
- `src/ai` — Anthropic browser client, prompts, and the JSON healer.
- `src/services` — use-cases: generation, calendar scheduling, progress.
- `src/components` + `src/App.tsx` — React UI, reactive via Dexie live queries.

## Quick start

```bash
npm install
npm run dev        # opens http://localhost:5173
```

Then click **Settings** (top-right), paste your Anthropic API key
(`sk-ant-…`), and generate a path. Get a key at
<https://console.anthropic.com>.

### Build / deploy

```bash
npm run build      # outputs static files to dist/
npm run preview    # serve the production build locally
```

Deploy the contents of `dist/` to any static host.

## Privacy & the API key

This is a single-user, local-first tool. Your API key is stored in the browser's
`localStorage` and sent **only** to `api.anthropic.com` on the direct generation
call — there is no StepByLearn server to receive it. The direct-browser call uses
Anthropic's `dangerouslyAllowBrowser` mode; because you supply your own key on
your own machine, this is an acceptable trade-off for a zero-backend app.

## Scripts

| Script                 | Purpose                          |
| ---------------------- | -------------------------------- |
| `npm run dev`          | Start the dev server             |
| `npm run build`        | Type-check and build to `dist/`  |
| `npm run preview`      | Serve the built site             |
| `npm run typecheck`    | Type-check only                  |
| `npm run lint`         | Lint with ESLint                 |
| `npm run format`       | Format with Prettier             |
| `npm run format:check` | Check formatting without writing |
| `npm test`             | Run the unit test suite (Vitest) |
| `npm run test:watch`   | Run tests in watch mode          |

## Legacy Python implementation

An earlier Python (FastAPI + SQLite) implementation of the same concepts lives in
[`legacy-python/`](./legacy-python) and in git history. It's kept for reference
and can be deleted if you don't need it.

## License

See [LICENSE](LICENSE).
