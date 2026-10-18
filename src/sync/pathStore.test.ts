import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/database";
import type { LearningPath } from "../domain/types";
import { dexiePathStore } from "./pathStore";

function path(id: string, updatedAt: string, title = id): LearningPath {
  return {
    id,
    title,
    topic: "",
    description: "",
    difficulty: "beginner",
    estimatedHours: null,
    modelName: "m",
    stepDuration: "30 minutes",
    contentType: "all",
    currentKnowledge: "",
    steps: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt,
    deletedAt: null,
  };
}

const T1 = "2026-07-01T00:00:00.000Z";
const T2 = "2026-07-02T00:00:00.000Z";
const T3 = "2026-07-03T00:00:00.000Z";

beforeEach(async () => {
  await db.paths.clear();
});

describe("dexiePathStore.putIfNewer", () => {
  it.each([
    ["no stored copy", undefined, T1, true],
    ["an older stored copy", T1, T2, true],
    ["an equal stored copy", T2, T2, false],
    ["a newer stored copy (e.g. an edit made while a pull ran)", T3, T2, false],
  ])("with %s", async (_name, stored, incomingAt, written) => {
    if (stored) await db.paths.put(path("a", stored, "stored"));

    const result = await dexiePathStore.putIfNewer([path("a", incomingAt, "incoming")]);

    expect(result.map((p) => p.id)).toEqual(written ? ["a"] : []);
    expect((await db.paths.get("a"))?.title).toBe(written ? "incoming" : "stored");
  });

  it("applies each path independently in one call", async () => {
    await db.paths.put(path("new", T3, "keep"));
    await db.paths.put(path("old", T1, "replace"));

    const written = await dexiePathStore.putIfNewer([
      path("new", T2, "lose"),
      path("old", T2, "win"),
      path("fresh", T1, "add"),
    ]);

    expect(written.map((p) => p.id).sort()).toEqual(["fresh", "old"]);
    expect((await db.paths.get("new"))?.title).toBe("keep");
    expect((await db.paths.get("old"))?.title).toBe("win");
  });

  it("treats a malformed stored row as absent rather than throwing", async () => {
    await db.paths.put({ id: "a", title: 5 } as unknown as LearningPath);
    const written = await dexiePathStore.putIfNewer([path("a", T1)]);
    expect(written).toHaveLength(1);
  });
});

describe("dexiePathStore.subscribe / listAll", () => {
  it("emits the current list, then again after every change, until unsubscribed", async () => {
    const seen: string[][] = [];
    const errors: unknown[] = [];
    await db.paths.put(path("a", T1));

    const unsubscribe = dexiePathStore.subscribe(
      (paths) => seen.push(paths.map((p) => p.id).sort()),
      (e) => errors.push(e),
    );
    await new Promise((r) => setTimeout(r, 50));
    await db.paths.put(path("b", T1));
    await new Promise((r) => setTimeout(r, 50));
    unsubscribe();
    await db.paths.put(path("c", T1));
    await new Promise((r) => setTimeout(r, 50));

    expect(seen[0]).toEqual(["a"]);
    expect(seen[seen.length - 1]).toEqual(["a", "b"]);
    expect(errors).toEqual([]);
  });

  it("listAll includes tombstones", async () => {
    await db.paths.put({ ...path("a", T1), deletedAt: T2 });
    expect((await dexiePathStore.listAll()).map((p) => p.id)).toEqual(["a"]);
  });
});
