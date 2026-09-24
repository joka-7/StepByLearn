# Repository structure

Every file in this repo and what is inside it. The tree below is **generated** —
run `python .ai/skills/repo_tree/gen_tree.py --project . --output docs/STRUCTURE.md`
to refresh it, and never edit between the markers by hand.

<!-- BEGIN GENERATED TREE (depth=all entries=all) -->
```text
StepByLearn/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── docs.yml
│   │   └── security.yml
│   ├── copilot-instructions.md                   # Copilot's copy of AGENTS.md (generated)
│   └── dependabot.yml
├── docs/
│   ├── screenshots/
│   │   ├── analytics.png
│   │   ├── calendar.png
│   │   ├── dashboard.png
│   │   ├── manual-builder.png
│   │   ├── settings.png
│   │   └── study-desk.png
│   ├── .structure-notes.toml
│   ├── HLD.md                                    # StepByLearn — High-Level Design
│   ├── LLD.md                                    # StepByLearn — Low-Level Design
│   └── STRUCTURE.md                              # Repository structure
├── e2e/
│   └── screenshots.spec.ts
├── legacy-python/                                # Earlier FastAPI + SQLite implementation, kept for reference only — not part…
│   ├── src/                                      # The old backend's source
│   │   └── stepbylearn/
│   │       ├── ai/
│   │       │   ├── __init__.py                   # AI layer: the Strategy Pattern for hybrid local/cloud generation.
│   │       │   ├── base.py                       # The AI strategy interface (Strategy Pattern).
│   │       │   ├── cloud_anthropic.py            # Cloud AI backend using the Anthropic Claude API (high-fidelity generation).
│   │       │   ├── json_healer.py                # Coerce fragile LLM output into validated Pydantic domain models.
│   │       │   ├── local_ollama.py               # Local, free AI backend driven by an Ollama daemon (Llama3 / Mistral).
│   │       │   ├── prompts.py                    # Versioned prompt templates for syllabus generation.
│   │       │   └── resolver.py                   # Runtime AI strategy resolution (the Strategy Pattern's selection logic).
│   │       ├── api/
│   │       │   ├── routes/
│   │       │   │   ├── __init__.py               # HTTP route modules for the StepByLearn API.
│   │       │   │   ├── calendar.py               # Calendar scheduling and retrieval routes.
│   │       │   │   ├── health.py                 # Health and engine-availability probes.
│   │       │   │   ├── paths.py                  # Learning-path generation and retrieval routes.
│   │       │   │   ├── settings.py               # Settings and provider-preference routes (including safe key storage).
│   │       │   │   └── steps.py                  # Step progression routes (fully offline).
│   │       │   ├── __init__.py                   # FastAPI delivery layer: thin controllers over the application services.
│   │       │   ├── app.py                        # FastAPI application factory, lifespan, and error translation.
│   │       │   ├── container.py                  # Composition root: builds and holds long-lived application dependencies.
│   │       │   ├── deps.py                       # FastAPI dependency helpers exposing the container to routes.
│   │       │   └── schemas.py                    # API request/response DTOs (the HTTP boundary contract).
│   │       ├── config/
│   │       │   ├── __init__.py                   # Application configuration: runtime settings and filesystem path resolution.
│   │       │   ├── paths.py                      # Resolve OS-appropriate filesystem locations for local-first storage.
│   │       │   └── settings.py                   # Runtime settings loaded from the environment (via `pydantic-settings`).
│   │       ├── db/
│   │       │   ├── migrations/
│   │       │   │   ├── versions/
│   │       │   │   │   ├── .gitkeep
│   │       │   │   │   └── 09d0a37b13a1_baseline_schema.py  # Baseline schema
│   │       │   │   ├── env.py                    # Alembic migration environment.
│   │       │   │   └── script.py.mako
│   │       │   ├── __init__.py                   # SQLite persistence detail.
│   │       │   ├── engine.py                     # SQLite engine and session factory construction.
│   │       │   ├── mappers.py                    # Translation between ORM rows and Pydantic domain models.
│   │       │   └── orm.py                        # SQLAlchemy 2.0 ORM table definitions (the physical schema).
│   │       ├── domain/
│   │       │   ├── __init__.py                   # Pure domain layer: models, enums, and exceptions with no I/O dependencies.
│   │       │   ├── enums.py                      # Enumerations shared across the domain.
│   │       │   ├── exceptions.py                 # Domain-specific exception hierarchy.
│   │       │   ├── ids.py                        # Time-sortable identifier generation.
│   │       │   └── models.py                     # Domain models (Pydantic v2).
│   │       ├── repositories/
│   │       │   ├── __init__.py                   # Repository layer: offline-capable data access behind stable interfaces.
│   │       │   ├── base.py                       # Abstract repository protocols.
│   │       │   ├── calendar_repo.py              # SQLAlchemy implementation of the calendar repository.
│   │       │   ├── learning_path_repo.py         # SQLAlchemy implementation of the learning-path repository.
│   │       │   ├── settings_repo.py              # SQLAlchemy implementation of the singleton settings repository.
│   │       │   ├── step_repo.py                  # SQLAlchemy implementation of the step repository.
│   │       │   └── unit_of_work.py               # Unit of Work: a single transactional boundary over all repositories.
│   │       ├── security/
│   │       │   ├── __init__.py                   # Secret handling: keyring-first cloud API key storage with encrypted fallback.
│   │       │   └── secret_store.py               # Cloud API key storage with a keyring-first, encrypted-DB-fallback strategy.
│   │       ├── services/
│   │       │   ├── __init__.py                   # Application services: use-case orchestration over repositories and AI.
│   │       │   ├── calendar_service.py           # Calendar scheduling: map ordered path steps onto concrete dates.
│   │       │   ├── path_generation.py            # Path generation use-case: resolve strategy -> generate -> heal -> persist.
│   │       │   └── progress_service.py           # Offline progression tracking: mark steps done and compute completion stats.
│   │       ├── web/
│   │       │   ├── assets/
│   │       │   │   ├── app.css
│   │       │   │   └── app.js
│   │       │   ├── index.html
│   │       │   └── sw.js
│   │       ├── __init__.py                       # Offline-first, hybrid-AI, step-by-step learning platform.
│   │       └── __main__.py                       # Console entrypoint: launch the local FastAPI server.
│   ├── tests/                                    # The old backend's tests
│   │   ├── e2e/
│   │   │   └── test_api_offline.py               # End-to-end API test proving the full flow works entirely offline.
│   │   ├── integration/
│   │   │   ├── test_path_generation.py           # Integration tests for the path-generation orchestration.
│   │   │   └── test_repositories.py              # Integration tests for the repositories against a real SQLite database.
│   │   ├── unit/
│   │   │   ├── test_calendar_service.py          # Tests for calendar scheduling logic.
│   │   │   ├── test_json_healer.py               # Tests for the fragile-JSON healing pipeline (the highest-risk component).
│   │   │   └── test_strategy_resolver.py         # Tests for runtime AI strategy resolution.
│   │   ├── __init__.py
│   │   └── conftest.py                           # Shared pytest fixtures: in-memory database, fakes, and a wired container.
│   ├── .env.example
│   ├── .python-version
│   ├── Makefile
│   ├── alembic.ini
│   ├── pyproject.toml
│   └── uv.lock
├── public/                                       # Static assets + PWA manifest
│   ├── icons/
│   │   ├── icon-128.png
│   │   ├── icon-16.png
│   │   ├── icon-180.png
│   │   ├── icon-192.png
│   │   ├── icon-256.png
│   │   ├── icon-32.png
│   │   ├── icon-384.png
│   │   ├── icon-48.png
│   │   ├── icon-512.png
│   │   ├── icon-64.png
│   │   └── icon-96.png
│   ├── apple-touch-icon.png
│   ├── icon.svg
│   └── manifest.webmanifest
├── src/
│   ├── ai/
│   │   ├── jsonHealer.test.ts
│   │   ├── jsonHealer.ts
│   │   ├── prompts.ts
│   │   ├── resolver.test.ts
│   │   ├── resolver.ts
│   │   └── strategy.ts
│   ├── components/                               # React UI — App shell, screens, layout chrome
│   │   ├── layout/                               # Sidebar + top bar chrome
│   │   │   ├── Sidebar.tsx                       # Left nav: view switcher
│   │   │   └── TopBar.tsx                        # Path selector + delete
│   │   ├── screens/                              # The five views: Dashboard, Study, Calendar, Analytics, ManualBuilder
│   │   │   ├── study/                            # Sub-components used only within StudyView
│   │   │   │   ├── AddStepModal.tsx              # Add a step manually
│   │   │   │   ├── EditStepModal.tsx             # Edit an existing step
│   │   │   │   └── StudyMaterialTab.tsx          # A step's learning resources
│   │   │   ├── AnalyticsView.tsx                 # Progress/streak stats, by content type
│   │   │   ├── CalendarView.tsx                  # Scheduling a path's steps onto dates
│   │   │   ├── DashboardView.tsx                 # Path list + new-path generation form
│   │   │   ├── ManualBuilderView.tsx             # Build a path without AI
│   │   │   └── StudyView.tsx                     # Active step study desk
│   │   ├── GithubIcon.tsx
│   │   ├── SettingsModal.tsx                     # Provider + API key + model settings
│   │   └── viewTypes.ts
│   ├── db/
│   │   └── database.ts
│   ├── domain/
│   │   ├── ids.test.ts
│   │   ├── ids.ts
│   │   └── types.ts
│   ├── firebase/
│   │   ├── auth.ts
│   │   ├── config.test.ts
│   │   ├── config.ts
│   │   └── pathSync.ts
│   ├── hooks/
│   │   ├── useAuthUser.ts
│   │   └── useBackClose.ts
│   ├── repositories/
│   │   ├── pathRepository.ts
│   │   └── settingsRepository.ts
│   ├── services/
│   │   ├── calendar.ts
│   │   ├── generation.ts
│   │   ├── manualBuilder.ts
│   │   ├── progress.test.ts
│   │   └── progress.ts
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   └── vite-env.d.ts
├── .ai                                           # Ogen-ai submodule — the shared source of rules, skills and the ai-sync…
├── .env.local.example
├── .gitignore
├── .gitmodules
├── .prettierignore
├── .prettierrc
├── AGENTS.md                                     # The compiled coding rules every AI assistant reads — generated, do not…
├── CLAUDE.md                                     # Claude Code's copy of AGENTS.md (generated)
├── GEMINI.md                                     # Gemini CLI's copy of AGENTS.md (generated)
├── LICENSE
├── README.md                                     # StepByLearn
├── SECURITY.md                                   # Security Policy
├── ai-config.toml                                # Which rule fragments and target tools ai-sync compiles for this repo
├── eslint.config.js
├── firestore.rules
├── index.html
├── package-lock.json
├── package.json
├── playwright.config.ts
├── tsconfig.json
├── vercel.json
├── vite.config.ts
└── vitest.config.ts
```
<!-- END GENERATED TREE -->
