/**
 * Domain model for StepByLearn.
 *
 * These are the plain, framework-free shapes every layer agrees on. They are
 * persisted as-is in IndexedDB (via Dexie) and returned from the AI layer after
 * validation, so the whole app shares one source of truth for structure.
 */

export type Difficulty = "beginner" | "intermediate" | "advanced";

export type StepStatus = "not_started" | "in_progress" | "done";

/** A single external reference attached to a step. */
export interface StepResource {
  label: string;
  url: string;
}

/** An ordered, individually trackable unit of a learning path. */
export interface PathStep {
  id: string;
  orderIndex: number;
  title: string;
  content: string;
  resources: StepResource[];
  estimatedMinutes: number | null;
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
  content: string;
  resources: StepResource[];
  estimatedMinutes: number | null;
}

/** Persisted, cloud-only provider preferences (the API key is stored apart). */
export interface AppSettings {
  /** Singleton key in the settings table. */
  id: "singleton";
  cloudModel: string;
}
