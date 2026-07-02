"""Cloud API key storage with a keyring-first, encrypted-DB-fallback strategy.

Security posture:

* **Primary path** — the OS keyring (Keychain / Credential Manager / Secret
  Service). The plaintext key never touches the SQLite file; only an opaque
  ``cloud_key_ref`` handle is stored alongside settings.
* **Fallback path** — on headless systems with no secret service, the key is
  encrypted with Fernet (AES-128-CBC + HMAC) using a machine-bound key derived
  and cached under the app data directory, then stored as a ``BLOB``.

The rest of the application only sees :meth:`get_key` / :meth:`set_key` /
:meth:`delete_key`; which backend is active is an internal detail.
"""

from __future__ import annotations

import base64
import hashlib
import os
from pathlib import Path
from typing import TYPE_CHECKING

from cryptography.fernet import Fernet, InvalidToken

if TYPE_CHECKING:
    from stepbylearn.repositories.settings_repo import SettingsRepository

_SERVICE_NAME = "stepbylearn"
_DEFAULT_ACCOUNT = "anthropic"
_KEYFILE_NAME = ".fallback_secret.key"


class SecretStore:
    """Facade over OS-keyring and encrypted-fallback cloud key storage."""

    def __init__(self, data_dir: Path, *, account: str = _DEFAULT_ACCOUNT) -> None:
        """Initialize the store.

        Args:
            data_dir: Application data directory used to cache the fallback
                encryption key when the OS keyring is unavailable.
            account: Logical account/name under which the key is stored.
        """
        self._data_dir = data_dir
        self._account = account
        # Resolve backend availability once; re-checking per call is wasteful and
        # the environment does not change within a process lifetime.
        self._keyring_available = self._probe_keyring()

    @staticmethod
    def _probe_keyring() -> bool:
        """Detect whether a usable OS keyring backend is present.

        Returns:
            ``True`` if a non-fail backend is available, else ``False``.
        """
        try:
            import keyring
            from keyring.backends.fail import Keyring as FailKeyring

            # The "fail" backend raises on use; treat it as unavailable so we
            # transparently fall back to encrypted-at-rest storage.
            return not isinstance(keyring.get_keyring(), FailKeyring)
        except Exception:  # noqa: BLE001 - any import/backend error => unavailable
            return False

    @property
    def key_ref(self) -> str:
        """Return the opaque handle persisted in settings for this key.

        Returns:
            A ``service:account`` reference string (never the secret itself).
        """
        return f"{_SERVICE_NAME}:{self._account}"

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    def has_key(self, settings_repo: SettingsRepository) -> bool:
        """Report whether a cloud key is stored, without decrypting it.

        Args:
            settings_repo: Repository used to read the fallback blob.

        Returns:
            ``True`` if a key exists in either backend.
        """
        if self._keyring_available:
            import keyring

            return keyring.get_password(_SERVICE_NAME, self._account) is not None
        return settings_repo.get_encrypted_key() is not None

    def get_key(self, settings_repo: SettingsRepository) -> str | None:
        """Retrieve the plaintext cloud key, or ``None`` if unset.

        Args:
            settings_repo: Repository used to read the fallback blob.

        Returns:
            The decrypted key, or ``None`` when no key is stored.
        """
        if self._keyring_available:
            import keyring

            return keyring.get_password(_SERVICE_NAME, self._account)

        blob = settings_repo.get_encrypted_key()
        if blob is None:
            return None
        try:
            return self._fernet().decrypt(blob).decode("utf-8")
        except InvalidToken:
            # A corrupt/undecryptable blob is treated as "no key" rather than
            # crashing the whole request; the user can simply re-enter the key.
            return None

    def set_key(self, key: str, settings_repo: SettingsRepository) -> None:
        """Store the cloud key in the active backend.

        Args:
            key: The plaintext API key to store.
            settings_repo: Repository used to write the fallback blob.
        """
        if self._keyring_available:
            import keyring

            keyring.set_password(_SERVICE_NAME, self._account, key)
            return
        token = self._fernet().encrypt(key.encode("utf-8"))
        settings_repo.set_encrypted_key(token)

    def delete_key(self, settings_repo: SettingsRepository) -> None:
        """Remove any stored cloud key from the active backend.

        Args:
            settings_repo: Repository used to clear the fallback blob.
        """
        if self._keyring_available:
            import keyring

            try:
                keyring.delete_password(_SERVICE_NAME, self._account)
            except Exception:  # noqa: BLE001 - deleting a missing key is a no-op
                pass
            return
        settings_repo.set_encrypted_key(None)

    # ------------------------------------------------------------------ #
    # Fallback encryption helpers
    # ------------------------------------------------------------------ #
    def _fernet(self) -> Fernet:
        """Build a Fernet cipher from the machine-bound fallback key.

        Returns:
            A configured :class:`~cryptography.fernet.Fernet` instance.
        """
        return Fernet(self._load_or_create_fallback_key())

    def _load_or_create_fallback_key(self) -> bytes:
        """Load the cached fallback key, generating and persisting it if absent.

        The key file is written with ``0o600`` permissions. It is derived from
        fresh randomness the first time; subsequent runs reuse it so previously
        encrypted blobs remain decryptable.

        Returns:
            A 32-byte url-safe base64 Fernet key.
        """
        key_path = self._data_dir / _KEYFILE_NAME
        if key_path.exists():
            return key_path.read_bytes()

        # Derive from OS randomness; hash to normalize to 32 bytes then base64
        # into the url-safe form Fernet requires.
        raw = hashlib.sha256(os.urandom(64)).digest()
        fernet_key = base64.urlsafe_b64encode(raw)
        key_path.write_bytes(fernet_key)
        key_path.chmod(0o600)
        return fernet_key
