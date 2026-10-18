/**
 * Only http(s) URLs are ever rendered as links. Anything else — including
 * `javascript:` and `data:` URLs, which React 18 renders into `href` with
 * only a console warning — becomes "" (no link shown).
 */
export function toSafeUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  try {
    const { protocol } = new URL(trimmed);
    return protocol === "http:" || protocol === "https:" ? trimmed : "";
  } catch {
    return "";
  }
}
