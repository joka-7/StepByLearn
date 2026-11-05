/**
 * The pure half of Drive sync: the on-disk shape of a device file and the
 * rules for merging every device's file into one view.
 *
 * Each device writes only its own file and reads everyone's, keeping the
 * newest version of each record. Drive v3 has no conditional write, so one
 * shared file would let two devices silently overwrite each other; with one
 * writer per file there is nothing to overwrite. Deletes stay as tombstones
 * (`item: null`) so they win over an older copy held by another device.
 */

export const DOCUMENT_VERSION = 1;

/**
 * A device file nobody has written to for this long, all of whose records are
 * superseded by newer copies in other files, is deleted (see findCompactableFiles).
 */
export const STALE_DEVICE_FILE_MS = 90 * 24 * 60 * 60 * 1000;

/** Error raised for any failed Drive or Google sign-in request. */
export class DriveSyncError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    { status = 0, code = "", cause }: { status?: number; code?: string; cause?: unknown } = {},
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "DriveSyncError";
    this.status = status;
    this.code = code;
  }
}

/** Errors that retrying will not fix, so the file is skipped rather than failing the read. */
export function isPermanentlyUnreadable(err: unknown): boolean {
  return (
    err instanceof DriveSyncError &&
    (err.status === 404 || err.code === "corrupt-file" || err.code === "unsupported-version")
  );
}

type PlainObject = Record<string, unknown>;

export function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One record's newest known state: `item` is null for a delete. */
export interface RecordEntry {
  item: object | null;
  at: number;
}

export interface DeviceDocument {
  version: typeof DOCUMENT_VERSION;
  device: string;
  collections: Record<string, Record<string, RecordEntry>>;
}

export type Operation =
  | { type: "upsert"; collection: string; item: { id: string } }
  | { type: "delete"; collection: string; id: string };

export function emptyDocument(device: string): DeviceDocument {
  return { version: DOCUMENT_VERSION, device, collections: {} };
}

function isRecordEntry(entry: unknown): entry is RecordEntry {
  return (
    isPlainObject(entry) &&
    typeof entry.at === "number" &&
    Number.isFinite(entry.at) &&
    (entry.item === null || isPlainObject(entry.item))
  );
}

function keepEntries(map: unknown): Record<string, RecordEntry> {
  const kept: Record<string, RecordEntry> = {};
  if (!isPlainObject(map)) return kept;
  for (const [id, entry] of Object.entries(map)) {
    if (isRecordEntry(entry)) kept[id] = entry;
  }
  return kept;
}

/**
 * Validate one device file. Throws rather than returning an empty document:
 * an unreadable file treated as empty would be overwritten and its data lost.
 */
export function parseDeviceDocument(raw: unknown): DeviceDocument {
  if (!isPlainObject(raw) || typeof raw.device !== "string") {
    throw new DriveSyncError("Drive sync file is not in the expected format.", {
      code: "corrupt-file",
    });
  }
  if (raw.version !== DOCUMENT_VERSION) {
    throw new DriveSyncError(
      "Drive sync file was written by a newer StepByLearn. Update the app.",
      {
        code: "unsupported-version",
      },
    );
  }
  const collections = isPlainObject(raw.collections)
    ? Object.fromEntries(
        Object.entries(raw.collections).map(([name, items]) => [name, keepEntries(items)]),
      )
    : {};
  return { version: DOCUMENT_VERSION, device: raw.device, collections };
}

/**
 * Apply queued writes to this device's own document, stamping each with `at`.
 * Pure: returns a new document.
 */
export function applyOperations(
  document: DeviceDocument,
  operations: readonly Operation[],
  at: number,
): DeviceDocument {
  const collections: DeviceDocument["collections"] = Object.fromEntries(
    Object.entries(document.collections).map(([name, items]) => [name, { ...items }]),
  );
  for (const op of operations) {
    const items = (collections[op.collection] ??= {});
    if (op.type === "upsert") items[op.item.id] = { item: op.item, at };
    else items[op.id] = { item: null, at };
  }
  return { ...document, collections };
}

interface DeviceEntry extends RecordEntry {
  device: string;
}

/** Newest entry wins; a tie goes to the higher device id so every reader agrees. */
function newer(current: DeviceEntry | undefined, candidate: DeviceEntry): DeviceEntry {
  if (!current) return candidate;
  if (candidate.at !== current.at) return candidate.at > current.at ? candidate : current;
  return candidate.device > current.device ? candidate : current;
}

/** Latest `at` in a document, so the next write can be stamped after it. */
export function latestStamp(document: DeviceDocument): number {
  const stamps = Object.values(document.collections).flatMap((items) =>
    Object.values(items).map((entry) => entry.at),
  );
  return Math.max(0, ...stamps);
}

/**
 * Stamp for the next write: the wall clock, but never earlier than anything
 * already read. A device whose clock runs behind would otherwise lose every
 * edit to an older one written by a device whose clock runs ahead.
 */
export function nextStamp(now: number, latestSeen: number): number {
  return Math.max(now, latestSeen + 1);
}

export interface MergedView {
  /** Live records per collection. */
  collections: Record<string, object[]>;
  /** Ids per collection whose newest entry is a delete, so a device still holding an old copy can drop it. */
  deleted: Record<string, string[]>;
}

export function mergeDeviceDocuments(documents: readonly DeviceDocument[]): MergedView {
  const winners: Record<string, Record<string, DeviceEntry>> = {};
  for (const doc of documents) {
    for (const [name, items] of Object.entries(doc.collections)) {
      const byId = (winners[name] ??= {});
      for (const [id, entry] of Object.entries(items)) {
        byId[id] = newer(byId[id], { ...entry, device: doc.device });
      }
    }
  }
  const view: MergedView = { collections: {}, deleted: {} };
  for (const [name, byId] of Object.entries(winners)) {
    view.collections[name] = [];
    view.deleted[name] = [];
    for (const [id, entry] of Object.entries(byId)) {
      if (entry.item === null) view.deleted[name]?.push(id);
      else view.collections[name]?.push(entry.item);
    }
  }
  return view;
}

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, i) => sameJson(value, b[i]))
    );
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length && keys.every((k) => k in b && sameJson(a[k], b[k]))
    );
  }
  return false;
}

const KNOWN_DOCUMENT_KEYS = new Set(["version", "device", "collections"]);

function hasUnknownEntryKeys(document: DeviceDocument): boolean {
  return Object.values(document.collections).some((items) =>
    Object.values(items).some((entry) =>
      Object.keys(entry).some((k) => k !== "at" && k !== "item"),
    ),
  );
}

/**
 * True when parsing a device file threw something away: an entry that failed
 * validation, or a field this version does not know. The file still reads fine,
 * but it is not safe to delete on the strength of what was understood.
 */
export function parsingDroppedData(raw: unknown, document: DeviceDocument): boolean {
  if (!isPlainObject(raw)) return true;
  return (
    Object.keys(raw).some((key) => !KNOWN_DOCUMENT_KEYS.has(key)) ||
    hasUnknownEntryKeys(document) ||
    !sameJson(raw.collections ?? {}, document.collections)
  );
}

export interface DeviceFileEntry {
  id: string;
  name: string;
  modifiedTime?: string | undefined;
  /** Parsing dropped data from this file; it is never compacted. */
  lossy?: boolean | undefined;
  document: DeviceDocument;
}

interface Candidate {
  at: number;
  device: string;
  fileId: string;
  content: string;
}

/**
 * Whether `a` is the winning entry over `b`: newest stamp, then higher device
 * id (the merge's own rule), then higher file id so that two files that are
 * exact copies of each other still have one winner. The last step makes every
 * device agree on which file to keep, so none of them deletes both.
 */
function beats(a: Candidate, b: Candidate | undefined): boolean {
  if (!b) return true;
  if (a.at !== b.at) return a.at > b.at;
  if (a.device !== b.device) return a.device > b.device;
  return a.fileId > b.fileId;
}

/**
 * Which device files can be deleted without anyone losing a record.
 *
 * Each file is a device's own history, and nothing ever shrinks it: deletes stay
 * as tombstones and a device that is gone for good leaves its file behind. A file
 * qualifies only when it has had no writes for `maxIdleMs` *and* it holds the
 * winning entry for none of its records — every one has a newer copy in some
 * other file. Files holding winners are never listed, so deleting the rest
 * cannot change what the merge returns.
 *
 * Callers must also re-check that nothing wrote to a file since it was read,
 * right before deleting it; Drive has no conditional delete, so that narrows
 * the race but cannot close it.
 *
 * "Idle" is judged against the newest write Drive itself reports, and never later
 * than the local clock. A device whose clock is far ahead would otherwise see
 * every superseded file as idle; one far behind sees none, which is the safe side.
 */
export function findCompactableFiles(
  entries: readonly DeviceFileEntry[],
  options: {
    now: number;
    /** Marks this device's own file, which is never listed. Asked only about files that would otherwise be deleted. */
    isOwn: (entry: DeviceFileEntry) => boolean;
    maxIdleMs?: number;
  },
): DeviceFileEntry[] {
  const { now, isOwn, maxIdleMs = STALE_DEVICE_FILE_MS } = options;
  const modifiedAt = (entry: DeviceFileEntry): number => Date.parse(entry.modifiedTime ?? "");
  const newestWrite = Math.max(-Infinity, ...entries.map(modifiedAt).filter(Number.isFinite));
  // No usable modification time anywhere means no evidence of idleness at all.
  if (!Number.isFinite(newestWrite)) return [];
  const reference = Math.min(now, newestWrite);

  const winners = new Map<string, Candidate>();
  const ambiguous = new Set<string>();
  for (const { id, document } of entries) {
    for (const [name, items] of Object.entries(document.collections)) {
      for (const [recordId, entry] of Object.entries(items)) {
        const key = JSON.stringify([name, recordId]);
        const candidate: Candidate = {
          at: entry.at,
          device: document.device,
          fileId: id,
          content: JSON.stringify(entry.item),
        };
        const current = winners.get(key);
        // Two files tying on (stamp, device) with different content: the merge
        // cannot say which is right, so both are kept.
        if (
          current &&
          current.at === candidate.at &&
          current.device === candidate.device &&
          current.content !== candidate.content
        ) {
          ambiguous.add(current.fileId).add(id);
        }
        if (beats(candidate, current)) winners.set(key, candidate);
      }
    }
  }
  const needed = new Set([...ambiguous, ...[...winners.values()].map((w) => w.fileId)]);
  return entries.filter((entry) => {
    const modified = modifiedAt(entry);
    if (!Number.isFinite(modified) || reference - modified < maxIdleMs) return false;
    if (entry.lossy || needed.has(entry.id)) return false;
    return !isOwn(entry);
  });
}
