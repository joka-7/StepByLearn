/**
 * Local calendar-day helpers.
 *
 * Scheduled dates and streak days are the learner's *local* days, but
 * timestamps are stored as UTC ISO strings. Slicing a UTC string
 * (`toISOString().slice(0, 10)`) gives the wrong day for anyone not on UTC,
 * so every day-level conversion goes through here.
 */

/** Format a Date as its local YYYY-MM-DD calendar day. */
export function toLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The local calendar day an ISO timestamp falls on. */
export function localDateOf(timestamp: string): string {
  return toLocalISODate(new Date(timestamp));
}

/** Tomorrow's local calendar day. */
export function tomorrowLocalISODate(): string {
  const now = new Date();
  return toLocalISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
}

/**
 * The first day of the month `offset` months from `from`. Anchoring on the
 * 1st avoids `setMonth` overflow (Jan 31 + 1 month would land on Mar 3).
 */
export function firstOfMonthOffset(from: Date, offset: number): Date {
  return new Date(from.getFullYear(), from.getMonth() + offset, 1);
}
