.PHONY: install lint format typecheck test serve check

install:  ## Sync all dependencies (incl. dev) into the uv-managed venv.
	uv sync

lint:  ## Lint with Ruff.
	uv run ruff check src tests

format:  ## Auto-format with Ruff.
	uv run ruff format src tests

typecheck:  ## Static type-check with mypy (strict).
	uv run mypy src

test:  ## Run the test suite with coverage.
	uv run pytest

serve:  ## Launch the local FastAPI server.
	uv run stepbylearn

check: lint typecheck test  ## Run all gates.
