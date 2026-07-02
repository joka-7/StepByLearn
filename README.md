# StepByLearn

An **offline-first, hybrid-AI, step-by-step learning platform**. Generate a
structured learning path for any topic — using a **100% free local engine**
(Ollama running Llama3/Mistral) or an optional **cloud API key** (Anthropic
Claude) for higher-fidelity output — then schedule it onto a calendar and track
your progress. Everything is stored locally for absolute privacy and full
offline functionality.

## Highlights

- **Hybrid AI (Strategy Pattern).** A `StrategyResolver` picks between the local
  Ollama engine and the cloud Anthropic engine at runtime, honoring your
  preference (`auto` / `force_local` / `force_cloud`) and degrading gracefully
  when a backend is unreachable.
- **Local-first storage (Repository Pattern).** All paths, steps, calendar
  entries, and progress live in a zero-config local SQLite database behind a
  swappable repository layer. No account, no server, no network required to
  learn.
- **Resilient LLM parsing.** A defense-in-depth JSON healer cleans fragile local
  model output (code fences, prose, trailing commas, single quotes, truncation)
  and validates it into typed domain models, with a bounded corrective
  re-prompt.
- **Safe key storage.** The optional cloud API key is stored in the OS keyring
  (with an encrypted-at-rest fallback), never in the database or in plaintext.

## Architecture

Strictly layered with a single direction of dependency:

```
api → services → {repositories, ai} → domain
```

The `domain` layer is pure (no I/O); `db` is a persistence detail hidden behind
`repositories`. See `src/stepbylearn/` for the full layout.

## Requirements

- Python **≥ 3.12**
- [uv](https://docs.astral.sh/uv/) for dependency management
- (Optional) A running [Ollama](https://ollama.com/) daemon for local generation

## Quick start

```bash
uv sync                 # install dependencies
uv run alembic upgrade head   # create the local database schema
uv run stepbylearn      # launch the local server at http://127.0.0.1:8000
```

Then open <http://127.0.0.1:8000> for the minimal UI, or use the JSON API under
`/api` (interactive docs at `/docs`).

### Example API flow

```bash
# Generate a path
curl -X POST localhost:8000/api/paths \
  -H 'content-type: application/json' \
  -d '{"topic": "Rust ownership", "difficulty": "beginner"}'

# Schedule it, mark a step done, check progress
curl -X POST localhost:8000/api/paths/<id>/schedule \
  -d '{"start_date": "2026-07-01", "days_between": 1, "milestone_every": 3}'
curl -X PATCH localhost:8000/api/steps/<step-id>/status -d '{"status": "done"}'
curl localhost:8000/api/paths/<id>/progress
```

## Configuration

Non-secret knobs are read from the environment (prefix `SBL_`) or a `.env` file
— see `.env.example`. The cloud API key is **not** an env var; set it via
`PUT /api/settings` (`cloud_api_key`), which routes it to the keyring.

## Development

```bash
make check        # ruff + mypy (strict) + pytest with coverage
make lint         # ruff check
make typecheck    # mypy
make test         # pytest
```

## License

See [LICENSE](LICENSE).
