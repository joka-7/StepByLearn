/**
 * Local-first persistence via Dexie (IndexedDB).
 *
 * Everything the user creates — learning paths, steps, calendar dates, progress,
 * and provider settings — lives in the browser's IndexedDB. Nothing is sent to a
 * server; the only outbound request the app ever makes is the user-initiated
 * call to the Anthropic API for generation. Dexie itself is the repository
 * abstraction here, so swapping storage engines means replacing this one module.
 */

import Dexie, { type Table } from "dexie";
import type { AppSettings, LearningPath } from "../domain/types";

class StepByLearnDB extends Dexie {
  /** Learning paths keyed by id, indexed by creation time for ordering. */
  paths!: Table<LearningPath, string>;
  /** Singleton settings row (provider preferences). */
  settings!: Table<AppSettings, string>;

  constructor() {
    super("stepbylearn");
    // Steps live embedded on each path document, so only two stores are needed.
    this.version(1).stores({
      paths: "id, createdAt",
      settings: "id",
    });
  }
}

export const db = new StepByLearnDB();
