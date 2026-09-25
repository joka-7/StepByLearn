/**
 * Domain model for StepByLearn.
 *
 * These are the plain, framework-free shapes every layer agrees on. They are
 * persisted as-is in IndexedDB (via Dexie) and returned from the AI layer after
 * validation, so the whole app shares one source of truth for structure.
 */

export type Difficulty = "beginner" | "intermediate" | "advanced";

export type StepStatus = "not_started" | "in_progress" | "done";

/** The format a step's content is best delivered in. */
export type ContentType = "video" | "podcast" | "text";

/** A curated study material suggestion attached to a step, linking out to the web. */
export interface LearningResource {
  title: string;
  type: ContentType;
  description: string;
  duration: string;
  /** External URL to the actual material. */
  url: string;
}

/** An ordered, individually trackable unit of a learning path. */
export interface PathStep {
  id: string;
  orderIndex: number;
  title: string;
  /** Target time to complete the step, as free text (e.g. "45 minutes"). */
  duration: string;
  type: ContentType;
  description: string;
  keyConcepts: string[];
  /** Display title of the primary external resource for this step. */
  materialTitle: string;
  /** External URL to the primary material (video/podcast/article) for this step. */
  materialUrl: string;
  /** Additional, supplementary resource links beyond the primary material. */
  resources: LearningResource[];
  status: StepStatus;
  /** ISO timestamp set when the step is marked done; null otherwise. */
  doneAt: string | null;
  /** ISO date (YYYY-MM-DD) the step is scheduled on; null if unscheduled. */
  scheduledDate: string | null;
  /** Whether this step is flagged as a milestone on the timeline. */
  isMilestone: boolean;
}

/** The top-level aggregate: a titled path composed of ordered steps. */
export interface LearningPath {
  id: string;
  title: string;
  topic: string;
  description: string;
  difficulty: Difficulty;
  estimatedHours: number | null;
  /** Provenance: the model that generated this path. */
  modelName: string;
  /** Target per-step duration requested at generation time (e.g. "45 minutes"). */
  stepDuration: string;
  /** Preferred content format requested at generation time. */
  contentType: ContentType | "all";
  /** Learner's self-described background, fed into the generation prompt. */
  currentKnowledge: string;
  steps: PathStep[];
  createdAt: string;
  updatedAt: string;
}

/**
 * The raw syllabus shape the AI is asked to emit (before it becomes a
 * {@link LearningPath}). Kept permissive so healing can coerce fragile output.
 */
export interface SyllabusDraft {
  title: string;
  topic: string;
  description: string;
  difficulty: Difficulty;
  estimatedHours: number | null;
  steps: SyllabusStepDraft[];
}

export interface SyllabusStepDraft {
  title: string;
  duration: string;
  type: ContentType;
  description: string;
  keyConcepts: string[];
  materialTitle: string;
  materialUrl: string;
  resources: LearningResource[];
}

/**
 * The pre-0.6.7 single-provider settings shape, kept only so
 * `settingsRepository`'s one-time migration can read a user's existing Dexie
 * record. Superseded by `modeldispatcher-browser-agent`'s `AgentConfig`
 * (a multi-provider fallback list) for all new reads/writes — `provider` is
 * `string` rather than a provider union because that union (`domain/providers`)
 * no longer exists; the migration validates it against the shared registry.
 */
export interface LegacyAppSettings {
  /** Singleton key in the settings table. */
  id: "singleton";
  provider: string;
  models: Record<string, string>;
}
