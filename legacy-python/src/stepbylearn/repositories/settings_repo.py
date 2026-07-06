"""SQLAlchemy implementation of the singleton settings repository.

Also owns the *encrypted-at-rest fallback* column for the cloud key. The
plaintext key never appears on the domain :class:`AppSettings` model; the raw
``cloud_key_enc`` bytes are read/written through the dedicated accessors so the
security layer can decrypt them only when actually needed.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from stepbylearn.db.orm import AppSettingsRow
from stepbylearn.domain.enums import AIProvider, ProviderMode
from stepbylearn.domain.models import AppSettings

_SINGLETON_ID = 1


class SettingsRepository:
    """Read/write access to the singleton :class:`AppSettings` row."""

    def __init__(self, session: Session) -> None:
        """Initialize the repository.

        Args:
            session: The active SQLAlchemy session (owned by the unit of work).
        """
        self._session = session

    def _get_or_create_row(self) -> AppSettingsRow:
        """Return the singleton row, creating it with defaults if missing.

        Returns:
            The persisted (or newly added) settings row.
        """
        row = self._session.get(AppSettingsRow, _SINGLETON_ID)
        if row is None:
            defaults = AppSettings()
            row = AppSettingsRow(
                id=_SINGLETON_ID,
                active_provider=defaults.active_provider.value,
                provider_mode=defaults.provider_mode.value,
                ollama_base_url=defaults.ollama_base_url,
                ollama_model=defaults.ollama_model,
                cloud_model=defaults.cloud_model,
                cloud_key_ref=defaults.cloud_key_ref,
                cloud_key_enc=None,
                request_timeout_s=defaults.request_timeout_s,
                updated_at=defaults.updated_at,
            )
            self._session.add(row)
        return row

    def get(self) -> AppSettings:
        """Return current settings, materializing defaults on first access.

        Returns:
            The validated :class:`AppSettings` (never the encrypted key blob).
        """
        row = self._get_or_create_row()
        return AppSettings(
            active_provider=AIProvider(row.active_provider),
            provider_mode=ProviderMode(row.provider_mode),
            ollama_base_url=row.ollama_base_url,
            ollama_model=row.ollama_model,
            cloud_model=row.cloud_model,
            cloud_key_ref=row.cloud_key_ref,
            request_timeout_s=row.request_timeout_s,
            updated_at=row.updated_at,
        )

    def save(self, settings: AppSettings) -> None:
        """Persist updated settings onto the singleton row.

        The encrypted key blob is intentionally left untouched here; use
        :meth:`set_encrypted_key` to manage it.

        Args:
            settings: The settings to persist.
        """
        row = self._get_or_create_row()
        row.active_provider = settings.active_provider.value
        row.provider_mode = settings.provider_mode.value
        row.ollama_base_url = settings.ollama_base_url
        row.ollama_model = settings.ollama_model
        row.cloud_model = settings.cloud_model
        row.cloud_key_ref = settings.cloud_key_ref
        row.request_timeout_s = settings.request_timeout_s
        row.updated_at = datetime.now(UTC)

    def get_encrypted_key(self) -> bytes | None:
        """Return the Fernet-encrypted cloud key blob (fallback mode only).

        Returns:
            The encrypted bytes, or ``None`` when the keyring is in use or no
            key is stored.
        """
        return self._get_or_create_row().cloud_key_enc

    def set_encrypted_key(self, blob: bytes | None) -> None:
        """Store (or clear) the Fernet-encrypted cloud key blob.

        Args:
            blob: The encrypted key bytes, or ``None`` to clear it.
        """
        row = self._get_or_create_row()
        row.cloud_key_enc = blob
        row.updated_at = datetime.now(UTC)
