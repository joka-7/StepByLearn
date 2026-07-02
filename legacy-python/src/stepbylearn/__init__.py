"""StepByLearn — offline-first, hybrid-AI, step-by-step learning platform.

The package is organized into strictly layered modules with a single direction
of dependency::

    api -> services -> {repositories, ai} -> domain

The ``domain`` layer is pure (no I/O, no frameworks); ``db`` is a persistence
detail hidden behind the ``repositories`` package. This separation keeps the
core fully testable offline and lets the SQLite store be swapped for another
backend (e.g. a browser Dexie adapter) without touching business logic.
"""

__version__ = "0.1.0"
