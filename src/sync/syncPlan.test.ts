import { describe, expect, it } from "vitest";
import type { LearningPath } from "../domain/types";
import { planSync } from "./syncPlan";

function path(id: string, updatedAt: string, deletedAt: string | null = null): LearningPath {
  return {
    id,
    title: id,
    topic: "",
    description: "",
    difficulty: "beginner",
    estimatedHours: null,
    modelName: "m",
    stepDuration: "30 minutes",
    contentType: "all",
    currentKnowledge: "",
    steps: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    deletedAt,
  };
}

const OLD = "2026-07-01T00:00:00.000Z";
const NEW = "2026-07-08T00:00:00.000Z";

describe("planSync", () => {
  it.each([
    ["nothing on either side", [], [], { pull: [], push: [], inSync: [] }],
    ["local-only path is pushed", [path("a", OLD)], [], { pull: [], push: ["a"], inSync: [] }],
    ["remote-only path is pulled", [], [path("a", OLD)], { pull: ["a"], push: [], inSync: [] }],
    [
      "a stale local copy never overwrites a newer cloud copy",
      [path("a", OLD)],
      [path("a", NEW)],
      { pull: ["a"], push: [], inSync: [] },
    ],
    [
      "a newer local edit is pushed",
      [path("a", NEW)],
      [path("a", OLD)],
      { pull: [], push: ["a"], inSync: [] },
    ],
    [
      "identical versions do nothing",
      [path("a", OLD)],
      [path("a", OLD)],
      { pull: [], push: [], inSync: ["a"] },
    ],
    [
      "a newer remote delete beats an older local live copy",
      [path("a", OLD)],
      [path("a", NEW, NEW)],
      { pull: ["a"], push: [], inSync: [] },
    ],
    [
      "a newer local delete is pushed over an older live cloud copy",
      [path("a", NEW, NEW)],
      [path("a", OLD)],
      { pull: [], push: ["a"], inSync: [] },
    ],
  ])("%s", (_name, local, remote, expected) => {
    const plan = planSync(local, remote);
    expect({
      pull: plan.pull.map((p) => p.id),
      push: plan.push.map((p) => p.id),
      inSync: plan.inSync,
    }).toEqual(expected);
  });
});
