import { describe, expect, it, vi } from "vitest";
import type { LearningPath } from "../domain/types";
import { DriveSyncError } from "./driveDocument";
import type { DriveSync } from "./driveSync";
import { startPathDriveSync, type PullRequest, type SyncStatus } from "./pathDriveSync";
import type { PathStore } from "./pathStore";

const T1 = "2026-07-01T00:00:00.000Z";
const T2 = "2026-07-02T00:00:00.000Z";
const T3 = "2026-07-03T00:00:00.000Z";

function path(id: string, updatedAt: string, overrides: Partial<LearningPath> = {}): LearningPath {
  return {
    id,
    title: `Title ${id}`,
    topic: "topic",
    description: "private description",
    difficulty: "beginner",
    estimatedHours: 3,
    modelName: "model",
    stepDuration: "30 minutes",
    contentType: "all",
    currentKnowledge: "knows things",
    steps: [
      {
        id: `${id}-s1`,
        orderIndex: 0,
        title: "Secret step",
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
      },
    ],
    createdAt: T1,
    updatedAt,
    deletedAt: null,
    ...overrides,
  };
}

/** In-memory stand-in for the local store (Dexie), including its reactive subscription. */
function fakeStore(initial: LearningPath[] = []) {
  const rows = new Map(initial.map((p) => [p.id, p]));
  const listeners = new Set<(paths: LearningPath[]) => void>();
  const notify = () => listeners.forEach((l) => l([...rows.values()]));
  const store: PathStore = {
    listAll: async () => [...rows.values()],
    putIfNewer: async (paths) => {
      const written = paths.filter((p) => {
        const existing = rows.get(p.id);
        return !existing || existing.updatedAt < p.updatedAt;
      });
      written.forEach((p) => rows.set(p.id, p));
      if (written.length) notify();
      return written;
    },
    subscribe: (onChange) => {
      listeners.add(onChange);
      onChange([...rows.values()]);
      return () => listeners.delete(onChange);
    },
  };
  return {
    store,
    rows,
    /** A local edit made by the user. */
    edit(next: LearningPath) {
      rows.set(next.id, next);
      notify();
    },
    /** Deliver a snapshot as the live query would, without changing rows. */
    emit(snapshot: LearningPath[]) {
      listeners.forEach((l) => l(snapshot));
    },
    listenerCount: () => listeners.size,
  };
}

/** In-memory Drive collection implementing the slice of DriveSync the engine uses. */
function fakeDrive(initial: object[] = []) {
  const items = new Map<string, object>(initial.map((i) => [(i as { id: string }).id, i]));
  const state = {
    loads: 0,
    writes: [] as LearningPath[][],
    loadError: null as unknown,
    writeError: null as unknown,
  };
  const sync = {
    loadCollection: async () => {
      state.loads += 1;
      if (state.loadError) throw state.loadError;
      return items.size ? { items: [...items.values()], deletedIds: [] } : null;
    },
    upsertMany: async (_collection: string, list: readonly { id: string }[]) => {
      if (state.writeError) throw state.writeError;
      state.writes.push(list as LearningPath[]);
      for (const entry of list) items.set(entry.id, structuredClone(entry));
    },
  } as unknown as DriveSync;
  return { sync, items, state };
}

/** Let every queued promise and microtask finish. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function start(
  options: {
    local?: LearningPath[];
    drive?: ReturnType<typeof fakeDrive>;
    local2?: ReturnType<typeof fakeStore>;
    now?: () => number;
  } = {},
) {
  const local = options.local2 ?? fakeStore(options.local ?? []);
  const drive = options.drive ?? fakeDrive();
  const statuses: SyncStatus[] = [];
  let request: PullRequest = () => {};
  let triggerCleanups = 0;
  const stop = startPathDriveSync({
    sync: drive.sync,
    store: local.store,
    onStatus: (s) => statuses.push(s),
    triggers: (r) => {
      request = r;
      return () => {
        triggerCleanups += 1;
      };
    },
    ...(options.now ? { now: options.now } : {}),
  });
  return {
    local,
    drive,
    statuses,
    stop,
    pull: (o?: { force?: boolean }) => request(o),
    triggerCleanups: () => triggerCleanups,
    last: () => statuses[statuses.length - 1],
  };
}

describe("startPathDriveSync — first reconcile", () => {
  it("pushes courses only the device has and pulls courses only Drive has", async () => {
    const drive = fakeDrive([path("remote", T1)]);
    const s = start({ local: [path("local", T1)], drive });
    await settle();

    expect([...s.local.rows.keys()].sort()).toEqual(["local", "remote"]);
    expect(drive.state.writes.flat().map((p) => p.id)).toEqual(["local"]);
    expect(s.last()).toEqual({ state: "synced" });
  });

  it("never overwrites newer cloud data with a stale local copy", async () => {
    const drive = fakeDrive([path("a", T3, { title: "Edited on laptop" })]);
    const s = start({ local: [path("a", T1, { title: "Stale phone copy" })], drive });
    await settle();

    expect(s.local.rows.get("a")?.title).toBe("Edited on laptop");
    expect(drive.state.writes).toEqual([]);
    expect((drive.items.get("a") as LearningPath).title).toBe("Edited on laptop");
  });

  it("pushes a local course that is newer than the cloud's", async () => {
    const drive = fakeDrive([path("a", T1, { title: "old" })]);
    const s = start({ local: [path("a", T3, { title: "new" })], drive });
    await settle();

    expect((drive.items.get("a") as LearningPath).title).toBe("new");
    expect(s.local.rows.get("a")?.title).toBe("new");
  });

  it("does not write anything when both sides already match", async () => {
    const drive = fakeDrive([path("a", T2)]);
    start({ local: [path("a", T2)], drive });
    await settle();
    expect(drive.state.writes).toEqual([]);
  });

  it("reports syncing first and synced once the first reconcile finishes", async () => {
    const s = start({ local: [path("a", T1)] });
    expect(s.statuses[0]).toEqual({ state: "syncing" });
    await settle();
    expect(s.last()).toEqual({ state: "synced" });
  });

  it("skips invalid Drive records instead of failing the whole pull", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const drive = fakeDrive([{ id: "bad", title: 5 }, path("good", T1)]);
    const s = start({ drive });
    await settle();

    expect([...s.local.rows.keys()]).toEqual(["good"]);
    expect(s.last()).toEqual({ state: "synced" });
    warn.mockRestore();
  });
});

describe("startPathDriveSync — after the first reconcile", () => {
  it("pushes a later local edit once", async () => {
    const drive = fakeDrive();
    const s = start({ local: [path("a", T1)], drive });
    await settle();
    drive.state.writes.length = 0;

    s.local.edit(path("a", T2, { title: "edited" }));
    await settle();

    expect(drive.state.writes).toHaveLength(1);
    expect(drive.state.writes[0]?.[0]?.title).toBe("edited");
  });

  it("does not echo a pulled change back to Drive", async () => {
    const drive = fakeDrive([path("a", T1)]);
    const s = start({ drive });
    await settle();
    drive.items.set("a", path("a", T3, { title: "from another device" }));

    s.pull({ force: true });
    await settle();

    expect(s.local.rows.get("a")?.title).toBe("from another device");
    expect(drive.state.writes).toEqual([]);
  });

  it("ignores a snapshot older than what was last synced", async () => {
    const drive = fakeDrive([path("a", T1)]);
    const s = start({ drive });
    await settle();
    drive.items.set("a", path("a", T3));
    s.pull({ force: true });
    await settle();

    s.local.emit([path("a", T1, { title: "stale snapshot" })]);
    await settle();

    expect(drive.state.writes).toEqual([]);
    expect((drive.items.get("a") as LearningPath).title).not.toBe("stale snapshot");
  });

  it("does not overwrite an edit made while a pull was running", async () => {
    const drive = fakeDrive([path("a", T1)]);
    const s = start({ drive });
    await settle();
    drive.items.set("a", path("a", T2, { title: "remote" }));
    // The user edits before the pull applies its (older) remote copy.
    s.local.rows.set("a", path("a", T3, { title: "typed meanwhile" }));

    s.pull({ force: true });
    await settle();

    expect(s.local.rows.get("a")?.title).toBe("typed meanwhile");
    expect((drive.items.get("a") as LearningPath).title).toBe("typed meanwhile");
  });
});

describe("startPathDriveSync — deletes", () => {
  const deleted = (id: string, at: string) =>
    path(id, at, { deletedAt: at, title: "Kept locally for Undo" });

  it("syncs a delete as a slim tombstone and keeps the full copy locally for Undo", async () => {
    const drive = fakeDrive();
    const s = start({ local: [path("a", T1)], drive });
    await settle();

    s.local.edit(deleted("a", T2));
    await settle();

    const synced = drive.items.get("a") as LearningPath;
    expect(synced).toMatchObject({ id: "a", deletedAt: T2, updatedAt: T2, steps: [], title: "" });
    expect(JSON.stringify(synced)).not.toContain("Secret step");
    expect(JSON.stringify(synced)).not.toContain("private description");
    expect(s.local.rows.get("a")?.steps).toHaveLength(1);
  });

  it("deletes the local copy when another device deleted it", async () => {
    const drive = fakeDrive([path("a", T1)]);
    const s = start({ drive });
    await settle();
    drive.items.set("a", { ...path("a", T2), deletedAt: T2, steps: [], title: "" });

    s.pull({ force: true });
    await settle();

    expect(s.local.rows.get("a")?.deletedAt).toBe(T2);
  });

  it("does not insert a tombstone for a course this device never had", async () => {
    const drive = fakeDrive([{ ...path("ghost", T2), deletedAt: T2, steps: [], title: "" }]);
    const s = start({ drive });
    await settle();
    expect(s.local.rows.size).toBe(0);
  });

  it("keeps a deleted course deleted when a device with a stale live copy syncs", async () => {
    const drive = fakeDrive([{ ...path("a", T2), deletedAt: T2, steps: [], title: "" }]);
    const s = start({ local: [path("a", T1)], drive });
    await settle();

    expect(s.local.rows.get("a")?.deletedAt).toBe(T2);
    expect(drive.state.writes).toEqual([]);
  });

  it("restores a deleted course everywhere when the user undoes the delete", async () => {
    const drive = fakeDrive();
    const s = start({ local: [path("a", T1)], drive });
    await settle();
    s.local.edit(deleted("a", T2));
    await settle();

    s.local.edit(path("a", T3, { title: "Restored", deletedAt: null }));
    await settle();

    expect(drive.items.get("a")).toMatchObject({ title: "Restored", deletedAt: null });
    expect((drive.items.get("a") as LearningPath).steps).toHaveLength(1);
  });
});

describe("startPathDriveSync — failures", () => {
  it("reports offline when Drive is unreachable and catches up when the network returns", async () => {
    const drive = fakeDrive([path("remote", T1)]);
    drive.state.loadError = new DriveSyncError("offline", { code: "offline" });
    const s = start({ local: [path("local", T1)], drive });
    await settle();
    expect(s.last()).toEqual({ state: "offline" });
    expect(s.local.rows.has("remote")).toBe(false);

    drive.state.loadError = null;
    s.pull({ force: true });
    await settle();

    expect(s.last()).toEqual({ state: "synced" });
    expect(s.local.rows.has("remote")).toBe(true);
    expect(drive.items.has("local")).toBe(true);
  });

  it("does not push anything before the first pull has succeeded", async () => {
    const drive = fakeDrive();
    drive.state.loadError = new DriveSyncError("offline", { code: "offline" });
    const s = start({ local: [path("a", T1)], drive });
    await settle();

    s.local.edit(path("a", T2));
    await settle();

    expect(drive.state.writes).toEqual([]);
  });

  it("reports an expired session with a reconnect message", async () => {
    const drive = fakeDrive();
    drive.state.loadError = new DriveSyncError("expired", { code: "signed-out" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = start({ drive });
    await settle();

    expect(s.last()).toMatchObject({
      state: "error",
      message: expect.stringContaining("Reconnect"),
    });
    error.mockRestore();
  });

  it("reports a failed push and retries it on the next pull", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const drive = fakeDrive();
    drive.state.writeError = new DriveSyncError("busy", { status: 503 });
    const s = start({ local: [path("a", T1)], drive });
    await settle();
    expect(s.last()).toMatchObject({ state: "error" });
    expect(drive.items.size).toBe(0);

    drive.state.writeError = null;
    s.pull({ force: true });
    await settle();

    expect(s.last()).toEqual({ state: "synced" });
    expect(drive.items.has("a")).toBe(true);
    error.mockRestore();
  });

  it("retries a failed push when any other course changes locally, without waiting for a pull", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const drive = fakeDrive();
    const s = start({ local: [path("a", T1), path("b", T1)], drive });
    await settle();
    drive.items.clear();
    drive.state.writeError = new DriveSyncError("busy", { status: 503 });
    s.local.edit(path("a", T2));
    await settle();
    expect(drive.items.size).toBe(0);

    drive.state.writeError = null;
    s.local.edit(path("b", T2));
    await settle();

    expect([...drive.items.keys()].sort()).toEqual(["a", "b"]);
    error.mockRestore();
  });

  it("does not put error details or course content in the console", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const drive = fakeDrive();
    drive.state.writeError = new DriveSyncError("secret-token-abc", { status: 500 });
    start({ local: [path("a", T1)], drive });
    await settle();

    expect(JSON.stringify(error.mock.calls)).not.toContain("secret-token-abc");
    expect(JSON.stringify(error.mock.calls)).not.toContain("Secret step");
    error.mockRestore();
  });
});

describe("startPathDriveSync — pull triggers and stopping", () => {
  it("skips visibility pulls that come too soon, but not forced ones", async () => {
    let clock = 1_000_000;
    const drive = fakeDrive([path("a", T1)]);
    const s = start({ drive, now: () => clock });
    await settle();
    const afterStart = drive.state.loads;

    clock += 1_000;
    s.pull();
    await settle();
    expect(drive.state.loads).toBe(afterStart);

    s.pull({ force: true });
    await settle();
    expect(drive.state.loads).toBe(afterStart + 1);

    clock += 11_000;
    s.pull();
    await settle();
    expect(drive.state.loads).toBe(afterStart + 2);
  });

  it("stops watching, unregisters its triggers and ignores late work", async () => {
    const drive = fakeDrive();
    const s = start({ local: [path("a", T1)], drive });
    await settle();
    expect(s.local.listenerCount()).toBe(1);

    s.stop();
    s.local.edit(path("a", T2));
    s.pull({ force: true });
    await settle();

    expect(s.local.listenerCount()).toBe(0);
    expect(s.triggerCleanups()).toBe(1);
    expect(drive.state.writes.flat().map((p) => p.updatedAt)).toEqual([T1]);
  });

  it("stays silent after stop even if a pull was in flight", async () => {
    const drive = fakeDrive([path("a", T1)]);
    const s = start({ drive });
    s.stop();
    await settle();
    expect(s.local.rows.size).toBe(0);
  });
});

describe("startPathDriveSync — two devices", () => {
  it("converge on the same courses, edits and deletes through one Drive", async () => {
    const drive = fakeDrive();
    const phone = start({ local: [path("a", T1, { title: "from phone" })], drive });
    await settle();
    const web = start({ drive });
    await settle();
    expect(web.local.rows.get("a")?.title).toBe("from phone");

    web.local.edit(path("a", T2, { title: "edited on web" }));
    await settle();
    phone.pull({ force: true });
    await settle();
    expect(phone.local.rows.get("a")?.title).toBe("edited on web");

    phone.local.edit(path("a", T3, { deletedAt: T3 }));
    await settle();
    web.pull({ force: true });
    await settle();
    expect(web.local.rows.get("a")?.deletedAt).toBe(T3);
  });
});
