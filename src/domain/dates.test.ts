import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firstOfMonthOffset, localDateOf, toLocalISODate, tomorrowLocalISODate } from "./dates";

describe("toLocalISODate", () => {
  it.each([
    ["a midday local time", new Date(2026, 6, 8, 12, 0), "2026-07-08"],
    [
      "just after local midnight (still the previous day in UTC)",
      new Date(2026, 6, 8, 0, 30),
      "2026-07-08",
    ],
    ["single-digit month and day are zero-padded", new Date(2026, 0, 5), "2026-01-05"],
  ])("formats %s", (_name, date, expected) => {
    expect(toLocalISODate(date)).toBe(expected);
  });
});

describe("localDateOf", () => {
  it.each([
    ["01:30 local is the local day, not the UTC day", "2026-07-07T22:30:00.000Z", "2026-07-08"],
    ["23:30 local stays on that day", "2026-07-07T20:30:00.000Z", "2026-07-07"],
  ])("maps %s", (_name, timestamp, expected) => {
    expect(localDateOf(timestamp)).toBe(expected);
  });
});

describe("tomorrowLocalISODate", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each([
    ["at 01:00 local (previous day in UTC)", new Date(2026, 9, 6, 1, 0), "2026-10-07"],
    ["at 23:00 local", new Date(2026, 9, 6, 23, 0), "2026-10-07"],
    ["across a month end", new Date(2026, 9, 31, 12, 0), "2026-11-01"],
  ])("is the next local day %s", (_name, now, expected) => {
    vi.setSystemTime(now);
    expect(tomorrowLocalISODate()).toBe(expected);
  });
});

describe("firstOfMonthOffset", () => {
  it.each([
    ["Jan 31 + 1 is February", new Date(2026, 0, 31), 1, new Date(2026, 1, 1)],
    ["Mar 31 - 1 is February", new Date(2026, 2, 31), -1, new Date(2026, 1, 1)],
    ["Dec + 1 rolls the year", new Date(2026, 11, 15), 1, new Date(2027, 0, 1)],
    ["Jan - 1 rolls the year back", new Date(2026, 0, 15), -1, new Date(2025, 11, 1)],
  ])("%s", (_name, from, offset, expected) => {
    expect(firstOfMonthOffset(from, offset)).toEqual(expected);
  });
});
