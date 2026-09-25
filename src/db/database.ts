/**
 * Local-first persistence via Dexie (IndexedDB).
 *
 * Everything the user creates — learning paths, steps, calendar dates, and
 * progress — lives in the browser's IndexedDB. Provider settings live in
 * modeldispatcher-browser-agent's own localStorage config instead (shared
 * with every other app that adopts it); this DB's `settings` table only
 * holds a pre-0.6.7 legacy record for one-time migration. Nothing is sent to
 * a server; the only outbound requests the app makes are user-initiated
 * calls to the configured AI provider(s) for generation. Dexie itself is the
 * repository abstraction here, so swapping storage engines means replacing
 * this one module.
 */

import Dexie, { type Table } from "dexie";
import type { LearningPath, LegacyAppSettings } from "../domain/types";

class StepByLearnDB extends Dexie {
  /** Learning paths keyed by id, indexed by creation time for ordering. */
  paths!: Table<LearningPath, string>;
  /** Legacy singleton settings row (pre-0.6.7 provider preferences) — read
   * once by settingsRepository's migration, never written to again; current
   * settings live in modeldispatcher-browser-agent's own localStorage config. */
  settings!: Table<LegacyAppSettings, string>;

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
