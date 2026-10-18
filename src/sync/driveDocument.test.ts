import { describe, expect, it } from "vitest";
import {
  applyOperations,
  DriveSyncError,
  emptyDocument,
  findCompactableFiles,
  isPermanentlyUnreadable,
  latestStamp,
  mergeDeviceDocuments,
  nextStamp,
  parseDeviceDocument,
  parsingDroppedData,
  STALE_DEVICE_FILE_MS,
  type DeviceDocument,
  type DeviceFileEntry,
} from "./driveDocument";

const NOW = 1_700_000_000_000;

function doc(
  device: string,
  paths: Record<string, { item: { id: string; title?: string } | null; at: number }> = {},
): DeviceDocument {
  return { version: 1, device, collections: { paths } };
}

describe("parseDeviceDocument", () => {
  it("keeps valid entries and drops malformed ones", () => {
    const parsed = parseDeviceDocument({
      version: 1,
      device: "d1",
      collections: {
        paths: {
          ok: { item: { id: "ok" }, at: 5 },
          deleted: { item: null, at: 6 },
          noStamp: { item: { id: "x" } },
          badItem: { item: "text", at: 7 },
          nanStamp: { item: null, at: Number.NaN },
        },
      },
    });
    expect(Object.keys(parsed.collections.paths ?? {})).toEqual(["ok", "deleted"]);
  });

  it.each([
    ["not an object", "text", "corrupt-file"],
    ["null", null, "corrupt-file"],
    ["no device id", { version: 1, collections: {} }, "corrupt-file"],
    ["a newer version", { version: 2, device: "d", collections: {} }, "unsupported-version"],
    ["a missing version", { device: "d", collections: {} }, "unsupported-version"],
  ])("throws for %s rather than returning an empty document", (_name, raw, code) => {
    expect(() => parseDeviceDocument(raw)).toThrow(DriveSyncError);
    try {
      parseDeviceDocument(raw);
    } catch (err) {
      expect((err as DriveSyncError).code).toBe(code);
    }
  });

  it("treats missing or non-object collections as empty", () => {
    expect(parseDeviceDocument({ version: 1, device: "d" }).collections).toEqual({});
    expect(
      parseDeviceDocument({ version: 1, device: "d", collections: { paths: [] } }).collections,
    ).toEqual({ paths: {} });
  });
});

describe("applyOperations", () => {
  it("stamps upserts and deletes with the write time without touching the input", () => {
    const original = doc("d1", { a: { item: { id: "a", title: "old" }, at: 1 } });
    const snapshot = JSON.stringify(original);

    const next = applyOperations(
      original,
      [
        { type: "upsert", collection: "paths", item: { id: "a", title: "new" } as { id: string } },
        { type: "delete", collection: "paths", id: "b" },
        { type: "upsert", collection: "other", item: { id: "z" } },
      ],
      99,
    );

    expect(next.collections).toEqual({
      paths: { a: { item: { id: "a", title: "new" }, at: 99 }, b: { item: null, at: 99 } },
      other: { z: { item: { id: "z" }, at: 99 } },
    });
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe("mergeDeviceDocuments", () => {
  it("keeps the newest version of each record across devices", () => {
    const merged = mergeDeviceDocuments([
      doc("d1", { a: { item: { id: "a", title: "old" }, at: 1 }, b: { item: { id: "b" }, at: 9 } }),
      doc("d2", { a: { item: { id: "a", title: "new" }, at: 2 }, b: { item: { id: "b" }, at: 3 } }),
    ]);
    expect(merged.collections.paths).toEqual(
      expect.arrayContaining([{ id: "a", title: "new" }, { id: "b" }]),
    );
    expect(merged.collections.paths).toHaveLength(2);
  });

  it("breaks a stamp tie in favor of the higher device id so every reader agrees", () => {
    const a = doc("d1", { x: { item: { id: "x", title: "from d1" }, at: 5 } });
    const b = doc("d2", { x: { item: { id: "x", title: "from d2" }, at: 5 } });
    expect(mergeDeviceDocuments([a, b]).collections.paths).toEqual([{ id: "x", title: "from d2" }]);
    expect(mergeDeviceDocuments([b, a]).collections.paths).toEqual([{ id: "x", title: "from d2" }]);
  });

  it("reports a delete newer than another device's copy, and hides the record", () => {
    const merged = mergeDeviceDocuments([
      doc("d1", { a: { item: { id: "a" }, at: 1 } }),
      doc("d2", { a: { item: null, at: 2 } }),
    ]);
    expect(merged.collections.paths).toEqual([]);
    expect(merged.deleted.paths).toEqual(["a"]);
  });

  it("lets a record edited after a delete come back", () => {
    const merged = mergeDeviceDocuments([
      doc("d1", { a: { item: null, at: 2 } }),
      doc("d2", { a: { item: { id: "a" }, at: 3 } }),
    ]);
    expect(merged.collections.paths).toEqual([{ id: "a" }]);
    expect(merged.deleted.paths).toEqual([]);
  });

  it("returns empty views for no documents", () => {
    expect(mergeDeviceDocuments([])).toEqual({ collections: {}, deleted: {} });
  });
});

describe("nextStamp / latestStamp", () => {
  it.each([
    ["the clock is ahead of everything seen", 2000, 1000, 2000],
    ["a device clock runs behind data already in Drive", 1000, 5000, 5001],
    ["the clock equals the newest stamp", 5000, 5000, 5001],
  ])("when %s", (_name, now, latestSeen, expected) => {
    expect(nextStamp(now, latestSeen)).toBe(expected);
  });

  it("latestStamp is the newest entry in the document, or 0 when empty", () => {
    expect(latestStamp(emptyDocument("d"))).toBe(0);
    expect(
      latestStamp(doc("d", { a: { item: null, at: 4 }, b: { item: { id: "b" }, at: 9 } })),
    ).toBe(9);
  });
});

describe("parsingDroppedData", () => {
  const raw = {
    version: 1,
    device: "d",
    collections: { paths: { a: { item: { id: "a" }, at: 1 } } },
  };

  it("is false when everything was understood", () => {
    expect(parsingDroppedData(raw, parseDeviceDocument(raw))).toBe(false);
  });

  it.each([
    ["an unknown top-level field", { ...raw, profile: {} }],
    [
      "an entry that failed validation",
      { ...raw, collections: { paths: { ...raw.collections.paths, bad: { at: 1, item: 3 } } } },
    ],
    [
      "an unknown field on an entry",
      { ...raw, collections: { paths: { a: { item: { id: "a" }, at: 1, extra: true } } } },
    ],
  ])("is true for %s", (_name, withExtra) => {
    expect(parsingDroppedData(withExtra, parseDeviceDocument(withExtra))).toBe(true);
  });
});

describe("isPermanentlyUnreadable", () => {
  it.each([
    ["404", new DriveSyncError("x", { status: 404 }), true],
    ["corrupt-file", new DriveSyncError("x", { code: "corrupt-file" }), true],
    ["unsupported-version", new DriveSyncError("x", { code: "unsupported-version" }), true],
    ["a 500", new DriveSyncError("x", { status: 500 }), false],
    ["an offline error", new DriveSyncError("x", { code: "offline" }), false],
    ["a non-Drive error", new Error("x"), false],
  ])("%s -> %s", (_name, err, expected) => {
    expect(isPermanentlyUnreadable(err)).toBe(expected);
  });
});

describe("findCompactableFiles", () => {
  const OLD = new Date(NOW - STALE_DEVICE_FILE_MS - 1_000).toISOString();
  const RECENT = new Date(NOW - 1_000).toISOString();

  function file(
    id: string,
    document: DeviceDocument,
    overrides: Partial<DeviceFileEntry> = {},
  ): DeviceFileEntry {
    return {
      id,
      name: `stepbylearn-${document.device}.json`,
      modifiedTime: OLD,
      document,
      ...overrides,
    };
  }

  const never = () => false;
  const idsOf = (entries: DeviceFileEntry[]) => entries.map((e) => e.id);

  it("lists an idle file whose every record has a newer copy elsewhere", () => {
    const stale = file("f1", doc("d1", { a: { item: { id: "a" }, at: 1 } }));
    const current = file("f2", doc("d2", { a: { item: { id: "a" }, at: 2 } }), {
      modifiedTime: RECENT,
    });
    expect(idsOf(findCompactableFiles([stale, current], { now: NOW, isOwn: never }))).toEqual([
      "f1",
    ]);
  });

  it("keeps an idle file that holds the newest copy of any record", () => {
    const holder = file("f1", doc("d1", { a: { item: { id: "a" }, at: 9 } }));
    const other = file("f2", doc("d2", { a: { item: { id: "a" }, at: 2 } }), {
      modifiedTime: RECENT,
    });
    expect(findCompactableFiles([holder, other], { now: NOW, isOwn: never })).toEqual([]);
  });

  it("keeps a recently written file even when it is fully superseded", () => {
    const young = file("f1", doc("d1", { a: { item: { id: "a" }, at: 1 } }), {
      modifiedTime: RECENT,
    });
    const newer = file("f2", doc("d2", { a: { item: { id: "a" }, at: 2 } }), {
      modifiedTime: RECENT,
    });
    expect(findCompactableFiles([young, newer], { now: NOW, isOwn: never })).toEqual([]);
  });

  it("never lists this device's own file, and asks only about otherwise-deletable files", () => {
    const asked: string[] = [];
    const stale = file("f1", doc("d1", { a: { item: { id: "a" }, at: 1 } }));
    const current = file("f2", doc("d2", { a: { item: { id: "a" }, at: 2 } }), {
      modifiedTime: RECENT,
    });
    const result = findCompactableFiles([stale, current], {
      now: NOW,
      isOwn: (entry) => {
        asked.push(entry.id);
        return entry.id === "f1";
      },
    });
    expect(result).toEqual([]);
    expect(asked).toEqual(["f1"]);
  });

  it("lists an idle file with no records at all", () => {
    const empty = file("f1", doc("d1"));
    const current = file("f2", doc("d2", { a: { item: { id: "a" }, at: 2 } }), {
      modifiedTime: RECENT,
    });
    expect(idsOf(findCompactableFiles([empty, current], { now: NOW, isOwn: never }))).toEqual([
      "f1",
    ]);
  });

  it("keeps exactly one of two identical idle files", () => {
    const a = file("f1", doc("d1", { x: { item: { id: "x" }, at: 5 } }));
    const b = file("f2", doc("d1", { x: { item: { id: "x" }, at: 5 } }));
    // Idleness is relative to Drive's newest write, so something must be recent.
    const recent = file("f3", doc("d2", { y: { item: { id: "y" }, at: 6 } }), {
      modifiedTime: RECENT,
    });
    const result = findCompactableFiles([a, b, recent], { now: NOW, isOwn: never });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("f1");
  });

  it("keeps both files when one device wrote different content at the same stamp", () => {
    const a = file("f1", doc("d1", { x: { item: { id: "x", title: "A" }, at: 5 } }));
    const b = file("f2", doc("d1", { x: { item: { id: "x", title: "B" }, at: 5 } }));
    expect(findCompactableFiles([a, b], { now: NOW, isOwn: never })).toEqual([]);
  });

  it.each([
    ["no modifiedTime", { modifiedTime: undefined }],
    ["an unparseable modifiedTime", { modifiedTime: "not a date" }],
    ["entries parsing dropped (lossy)", { lossy: true }],
  ])("leaves a file with %s alone", (_name, overrides) => {
    const odd = file("f1", doc("d1", { a: { item: { id: "a" }, at: 1 } }), overrides);
    const current = file("f2", doc("d2", { a: { item: { id: "a" }, at: 2 } }), {
      modifiedTime: RECENT,
    });
    expect(findCompactableFiles([odd, current], { now: NOW, isOwn: never })).toEqual([]);
  });

  it("lists nothing when no file has a usable modification time", () => {
    const a = file("f1", doc("d1"), { modifiedTime: undefined });
    expect(findCompactableFiles([a], { now: NOW, isOwn: never })).toEqual([]);
  });

  it("measures idleness against Drive's newest write when the local clock runs ahead", () => {
    // Everything Drive reports was written long ago, so nothing is idle
    // relative to it even though the local clock is a year past that.
    const drive = new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString();
    const stale = file("f1", doc("d1", { a: { item: { id: "a" }, at: 1 } }), {
      modifiedTime: new Date(Date.parse(drive) - STALE_DEVICE_FILE_MS - 1).toISOString(),
    });
    const current = file("f2", doc("d2", { a: { item: { id: "a" }, at: 2 } }), {
      modifiedTime: drive,
    });
    const farFuture = NOW + 365 * 24 * 60 * 60 * 1000;
    expect(idsOf(findCompactableFiles([stale, current], { now: farFuture, isOwn: never }))).toEqual(
      ["f1"],
    );
    expect(
      findCompactableFiles(
        [{ ...stale, modifiedTime: new Date(Date.parse(drive) - 1_000).toISOString() }, current],
        { now: farFuture, isOwn: never },
      ),
    ).toEqual([]);
  });
});
