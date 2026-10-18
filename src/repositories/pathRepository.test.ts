import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/database";
import type { LearningPath, PathStep } from "../domain/types";
import {
  appendSteps,
  clearLocalPaths,
  deletePath,
  getPath,
  listAllPathRecords,
  listPaths,
  purgeExpiredTombstones,
  putPathRecords,
  restorePath,
  savePath,
  updatePath,
  updateStep,
} from "./pathRepository";

function step(id: string, overrides: Partial<PathStep> = {}): PathStep {
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
    ...overrides,
  };
}

function path(id: string, createdAt: string, overrides: Partial<LearningPath> = {}): LearningPath {
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
    steps: [step(`${id}-1`)],
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    ...overrides,
  };
}

const D1 = "2026-07-01T00:00:00.000Z";
const D2 = "2026-07-02T00:00:00.000Z";

beforeEach(async () => {
  await db.paths.clear();
});

describe("listPaths / getPath / listAllPathRecords", () => {
  it("lists live paths newest first and hides deleted ones", async () => {
    await savePath(path("old", D1));
    await savePath(path("new", D2));
    await savePath(path("gone", "2026-07-03T00:00:00.000Z", { deletedAt: D2 }));

    expect((await listPaths()).map((p) => p.id)).toEqual(["new", "old"]);
    expect((await listAllPathRecords()).map((p) => p.id).sort()).toEqual(["gone", "new", "old"]);
  });

  it.each([
    ["a live path", "live", "live"],
    ["a deleted path", "gone", undefined],
    ["an unknown id", "nope", undefined],
  ])("getPath returns %s", async (_name, id, expected) => {
    await savePath(path("live", D1));
    await savePath(path("gone", D1, { deletedAt: D2 }));
    expect((await getPath(id))?.id).toBe(expected);
  });

  it("skips rows that can't be paths instead of crashing, and backfills legacy ones", async () => {
    await db.paths.bulkPut([
      { id: "broken", createdAt: D1 },
      {
        id: "legacy",
        title: "Legacy",
        createdAt: D1,
        updatedAt: D1,
        steps: [{ id: "s", title: "Old step", content: "old body" }],
      },
    ] as unknown as LearningPath[]);

    const paths = await listPaths();

    expect(paths.map((p) => p.id)).toEqual(["legacy"]);
    expect(paths[0]).toMatchObject({
      deletedAt: null,
      contentType: "all",
      steps: [{ description: "old body", type: "text", keyConcepts: [] }],
    });
  });
});

describe("deletePath / restorePath", () => {
  it("soft-deletes, keeps the content for Undo, and bumps updatedAt so sync sees it", async () => {
    await savePath(path("a", D1));
    await deletePath("a");

    expect(await getPath("a")).toBeUndefined();
    const [record] = await listAllPathRecords();
    expect(record?.deletedAt).not.toBeNull();
    expect(record?.updatedAt).toBe(record?.deletedAt);
    expect(record?.updatedAt && record.updatedAt > D1).toBe(true);
    expect(record?.steps).toHaveLength(1);
  });

  it("restorePath brings it back with a newer updatedAt", async () => {
    await savePath(path("a", D1));
    await deletePath("a");
    const [deleted] = await listAllPathRecords();

    await restorePath("a");

    const restored = await getPath("a");
    expect(restored?.deletedAt).toBeNull();
    expect(restored && deleted && restored.updatedAt >= deleted.updatedAt).toBe(true);
  });

  it.each([
    ["deleting an unknown id", () => deletePath("missing")],
    ["restoring an unknown id", () => restorePath("missing")],
    ["restoring a live path", () => restorePath("live")],
  ])("is a no-op when %s", async (_name, act) => {
    await savePath(path("live", D1));
    await act();
    expect((await listAllPathRecords()).map((p) => p.id)).toEqual(["live"]);
    expect((await getPath("live"))?.updatedAt).toBe(D1);
  });
});

describe("purgeExpiredTombstones", () => {
  const now = new Date("2026-10-01T00:00:00.000Z");

  it.each([
    ["a tombstone older than 90 days", "2026-06-01T00:00:00.000Z", false],
    ["a recent tombstone", "2026-09-20T00:00:00.000Z", true],
  ])("handles %s", async (_name, deletedAt, kept) => {
    await savePath(path("a", D1, { deletedAt, updatedAt: deletedAt }));
    await purgeExpiredTombstones(now);
    expect((await listAllPathRecords()).length).toBe(kept ? 1 : 0);
  });

  it("never removes live paths", async () => {
    await savePath(path("live", "2020-01-01T00:00:00.000Z"));
    await purgeExpiredTombstones(now);
    expect(await listPaths()).toHaveLength(1);
  });
});

describe("updatePath / updateStep / appendSteps", () => {
  it("updatePath stamps updatedAt and returns the result", async () => {
    await savePath(path("a", D1));
    const updated = await updatePath("a", (p) => ({ ...p, title: "Renamed" }));
    expect(updated?.title).toBe("Renamed");
    expect(updated && updated.updatedAt > D1).toBe(true);
    expect((await getPath("a"))?.title).toBe("Renamed");
  });

  it.each([
    ["an unknown path", "missing"],
    ["a deleted path", "gone"],
  ])("updatePath does nothing for %s", async (_name, id) => {
    await savePath(path("gone", D1, { deletedAt: D2 }));
    const mutate = () => {
      throw new Error("must not run");
    };
    expect(await updatePath(id, mutate)).toBeUndefined();
  });

  it("serializes concurrent updates so none is lost", async () => {
    await savePath(path("a", D1, { steps: [] }));
    await Promise.all(Array.from({ length: 10 }, (_, i) => appendSteps("a", [step(`s${i}`)])));
    const result = await getPath("a");
    expect(result?.steps).toHaveLength(10);
    expect(result?.steps.map((s) => s.orderIndex).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it("updateStep changes only the targeted step", async () => {
    await savePath(path("a", D1, { steps: [step("s1"), step("s2")] }));
    await updateStep("a", "s2", (s) => ({ ...s, status: "done" }));
    const result = await getPath("a");
    expect(result?.steps.map((s) => s.status)).toEqual(["not_started", "done"]);
  });
});

describe("putPathRecords / clearLocalPaths", () => {
  it("putPathRecords keeps the timestamps it is given", async () => {
    await putPathRecords([path("a", D1, { updatedAt: D2 })]);
    expect((await listAllPathRecords())[0]?.updatedAt).toBe(D2);
  });

  it("clearLocalPaths removes everything, tombstones included", async () => {
    await savePath(path("a", D1));
    await savePath(path("b", D1, { deletedAt: D2 }));
    await clearLocalPaths();
    expect(await listAllPathRecords()).toEqual([]);
  });
});
