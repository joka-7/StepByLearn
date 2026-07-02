/**
 * Time-sortable identifier generation.
 *
 * Records use UUIDv7-style ids: the leading bits encode a millisecond
 * timestamp, so ids sort chronologically while remaining unique and
 * generatable entirely offline. `crypto.randomUUID` is v4 (not sortable), so a
 * small spec-shaped v7 implementation is provided here.
 */
export function newId(): string {
  const unixMs = Date.now();
  const bytes = new Uint8Array(16);

  // 48-bit big-endian millisecond timestamp in the first 6 bytes.
  bytes[0] = (unixMs / 2 ** 40) & 0xff;
  bytes[1] = (unixMs / 2 ** 32) & 0xff;
  bytes[2] = (unixMs / 2 ** 24) & 0xff;
  bytes[3] = (unixMs / 2 ** 16) & 0xff;
  bytes[4] = (unixMs / 2 ** 8) & 0xff;
  bytes[5] = unixMs & 0xff;

  // Remaining 10 bytes are random.
  crypto.getRandomValues(bytes.subarray(6));

  // Set version (7) and RFC 4122 variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
