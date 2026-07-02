"""Time-sortable identifier generation.

Aggregate roots use UUIDv7-style identifiers: the leading bits encode a
millisecond timestamp, so IDs sort chronologically while remaining globally
unique and generatable entirely offline (no database round-trip). Python's
standard library lacks a UUIDv7 constructor before 3.14, so a small, spec-shaped
implementation is provided here.
"""

from __future__ import annotations

import os
import time
import uuid


def new_id() -> str:
    """Generate a UUIDv7-style, lexicographically sortable identifier.

    The layout follows RFC 9562 §5.7: a 48-bit Unix-millisecond timestamp,
    the version nibble (7), 12 bits of randomness, the variant bits, and 62
    further random bits.

    Returns:
        The identifier as a canonical 36-character UUID string.
    """
    unix_ms = time.time_ns() // 1_000_000
    # 10 random bytes fill everything after the 48-bit timestamp.
    rand = os.urandom(10)

    # Assemble the 128-bit value: 48-bit timestamp in the most-significant bits.
    value = unix_ms << 80
    value |= rand[0] << 72
    value |= rand[1] << 64
    value |= int.from_bytes(rand[2:], "big")

    # Force the version (7) and RFC 4122 variant bits into place.
    value &= ~(0xF000 << 64)  # clear version nibble
    value |= 0x7000 << 64  # set version 7
    value &= ~(0xC000 << 48)  # clear variant bits
    value |= 0x8000 << 48  # set variant 0b10

    return str(uuid.UUID(int=value))
