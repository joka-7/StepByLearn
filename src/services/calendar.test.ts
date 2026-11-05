import { describe, expect, it } from "vitest";
import type { PathStep } from "../domain/types";
import { assignDates, InvalidScheduleError, type ScheduleOptions } from "./calendar";

function step(id: string): PathStep {
  return {
    id,
    orderIndex: 0,
    title: id,
    duration: "30 minutes",
    type: "text",
    description: "",
    keyConcepts: [],
    materialTitle: "",
    materialUrl: "",
    resources: [],
    status: "not_started",
    doneAt: null,
    scheduledDate: null,
    isMilestone: false,
  };
}

const base: ScheduleOptions = {
  startDate: "2026-10-09", // a Friday
  daysBetween: 1,
  skipWeekends: false,
  milestoneEvery: 0,
};

describe("assignDates", () => {
  it.each([
    ["one step per day", base, ["2026-10-09", "2026-10-10", "2026-10-11"]],
    ["every other day", { ...base, daysBetween: 2 }, ["2026-10-09", "2026-10-11", "2026-10-13"]],
    [
      "skipping weekends",
      { ...base, skipWeekends: true },
      ["2026-10-09", "2026-10-12", "2026-10-13"],
    ],
    [
      "a weekend start moves to Monday",
      { ...base, startDate: "2026-10-10", skipWeekends: true },
      ["2026-10-12", "2026-10-13", "2026-10-14"],
    ],
    [
      "across a month end",
      { ...base, startDate: "2026-10-30" },
      ["2026-10-30", "2026-10-31", "2026-11-01"],
    ],
  ])("schedules %s", (_name, options, expected) => {
    const result = assignDates([step("a"), step("b"), step("c")], options);
    expect(result.map((s) => s.scheduledDate)).toEqual(expected);
  });

  it.each([
    ["0 disables milestones", 0, [false, false, false, false]],
    ["every 2nd step", 2, [false, true, false, true]],
  ])("milestones: %s", (_name, milestoneEvery, expected) => {
    const result = assignDates([step("a"), step("b"), step("c"), step("d")], {
      ...base,
      milestoneEvery,
    });
    expect(result.map((s) => s.isMilestone)).toEqual(expected);
  });

  it.each([
    ["an empty start date", { ...base, startDate: "" }],
    ["a malformed start date", { ...base, startDate: "10/09/2026" }],
    ["zero days between", { ...base, daysBetween: 0 }],
    ["NaN days between", { ...base, daysBetween: Number.NaN }],
    ["a negative milestone interval", { ...base, milestoneEvery: -1 }],
  ])("rejects %s", (_name, options) => {
    expect(() => assignDates([step("a")], options)).toThrow(InvalidScheduleError);
  });
});
