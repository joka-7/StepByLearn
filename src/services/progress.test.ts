import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LearningPath, PathStep } from "../domain/types";
import { learnerStreakDays, summarize } from "./progress";

function makeStep(overrides: Partial<PathStep> = {}): PathStep {
  return {
    id: "step",
    orderIndex: 0,
    title: "Step",
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
    ...overrides,
  };
}

function makePath(steps: PathStep[], id = "path-1"): LearningPath {
  return {
    id,
    title: "Path",
    topic: "topic",
    description: "",
    difficulty: "beginner",
    estimatedHours: null,
    modelName: "test",
    stepDuration: "30 minutes",
    contentType: "all",
    currentKnowledge: "",
    steps,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("summarize", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("handles an empty path", () => {
    expect(summarize(makePath([]))).toEqual({
      totalSteps: 0,
      doneSteps: 0,
      percentComplete: 0,
      nextStepId: null,
      streakDays: 0,
    });
  });

  it("computes percentComplete and picks the first not-done step as next", () => {
    const path = makePath([
      makeStep({ id: "a", status: "done" }),
      makeStep({ id: "b", status: "not_started" }),
      makeStep({ id: "c", status: "not_started" }),
    ]);
    const summary = summarize(path);
    expect(summary.totalSteps).toBe(3);
    expect(summary.doneSteps).toBe(1);
    expect(summary.percentComplete).toBe(33);
    expect(summary.nextStepId).toBe("b");
  });

  it("is 100% complete with no next step when every step is done", () => {
    const path = makePath([
      makeStep({ id: "a", status: "done" }),
      makeStep({ id: "b", status: "done" }),
    ]);
    const summary = summarize(path);
    expect(summary.percentComplete).toBe(100);
    expect(summary.nextStepId).toBeNull();
  });

  it("counts a streak of consecutive days ending today", () => {
    const path = makePath([
      makeStep({ id: "a", status: "done", doneAt: "2026-07-08T09:00:00.000Z" }),
      makeStep({ id: "b", status: "done", doneAt: "2026-07-07T09:00:00.000Z" }),
      makeStep({ id: "c", status: "done", doneAt: "2026-07-06T09:00:00.000Z" }),
    ]);
    expect(summarize(path).streakDays).toBe(3);
  });

  it("is zero when the most recent completion wasn't today", () => {
    const path = makePath([
      makeStep({ id: "a", status: "done", doneAt: "2026-07-06T09:00:00.000Z" }),
    ]);
    expect(summarize(path).streakDays).toBe(0);
  });
});

describe("streaks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 15:00 on 2026-07-08 in Asia/Jerusalem (UTC+3), the timezone vitest pins.
    vi.setSystemTime(new Date("2026-07-08T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["a 01:30 local completion counts on the local day", ["2026-07-07T22:30:00.000Z"], 1],
    ["a 23:30 local completion counts on the local day", ["2026-07-07T20:30:00.000Z"], 0],
    [
      "consecutive local days across midnight UTC",
      ["2026-07-07T22:30:00.000Z", "2026-07-07T09:00:00.000Z"],
      2,
    ],
  ])("summarize: %s", (_name, doneAts, expected) => {
    const path = makePath(
      doneAts.map((doneAt, i) => makeStep({ id: `s${i}`, status: "done", doneAt })),
    );
    expect(summarize(path).streakDays).toBe(expected);
  });

  it.each([
    ["no paths", [], 0],
    [
      "completions split across two courses form one streak",
      [
        makePath([makeStep({ id: "a", status: "done", doneAt: "2026-07-08T09:00:00.000Z" })], "p1"),
        makePath([makeStep({ id: "b", status: "done", doneAt: "2026-07-07T09:00:00.000Z" })], "p2"),
      ],
      2,
    ],
  ])("learnerStreakDays: %s", (_name, paths, expected) => {
    expect(learnerStreakDays(paths)).toBe(expected);
  });
});
