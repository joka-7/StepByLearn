/**
 * Offline course construction: build a {@link LearningPath} from user-entered
 * step outlines, with no AI call involved.
 *
 * Each step's "material" is simply whatever URL the user pastes in — there is
 * no AI to source or write content, so this only structures what the user
 * already gave it.
 */

import { newId } from "../domain/ids";
import type { ContentType, LearningPath, PathStep } from "../domain/types";
import { appendSteps, savePath, updateStep } from "../repositories/pathRepository";

export interface ManualStepInput {
  title: string;
  duration: string;
  type: ContentType;
  description: string;
  /** Optional link to the actual study material (video/podcast/article). */
  materialUrl: string;
}

export interface ManualPathInput {
  title: string;
  topic: string;
  stepDuration: string;
  steps: ManualStepInput[];
}

function buildManualStep(
  step: ManualStepInput,
  topic: string,
  index: number,
  fallbackDuration: string,
): PathStep {
  const title = step.title.trim() || `Milestone ${index + 1}`;
  const materialUrl = step.materialUrl.trim();
  return {
    id: newId(),
    orderIndex: index,
    title,
    duration: step.duration || fallbackDuration,
    type: step.type,
    description:
      step.description.trim() || "Study guide and exercise instructions for this milestone.",
    keyConcepts: [topic],
    materialTitle: materialUrl ? title : "",
    materialUrl,
    resources: [],
    status: "not_started",
    doneAt: null,
    scheduledDate: null,
    isMilestone: false,
  };
}

/** Build a learning path from user-entered steps and material links, offline. */
export async function createManualPath(input: ManualPathInput): Promise<LearningPath> {
  const now = new Date().toISOString();

  const steps: PathStep[] = input.steps.map((step, index) =>
    buildManualStep(step, input.topic, index, input.stepDuration),
  );

  const path: LearningPath = {
    id: newId(),
    title: input.title,
    topic: input.topic,
    description: `Manually engineered course covering ${input.topic}.`,
    difficulty: "beginner",
    estimatedHours: null,
    modelName: "manual",
    stepDuration: input.stepDuration,
    contentType: "all",
    currentKnowledge: "Manually engineered course",
    steps,
    createdAt: now,
    updatedAt: now,
  };

  await savePath(path);
  return path;
}

/** Append a single user-entered step to an existing path, offline. */
export async function addManualStep(
  path: LearningPath,
  input: ManualStepInput,
): Promise<LearningPath> {
  const step = buildManualStep(input, path.topic, path.steps.length, path.stepDuration);
  const updated = await appendSteps(path.id, [step]);
  return updated ?? path;
}

/**
 * Apply user-entered corrections to an existing step's core fields — title,
 * type, duration, description, and material link — offline. Progress
 * (status/doneAt/scheduledDate), keyConcepts, and supplementary resources
 * are left untouched.
 */
export async function editManualStep(
  path: LearningPath,
  stepId: string,
  input: ManualStepInput,
): Promise<LearningPath | undefined> {
  const title = input.title.trim() || undefined;
  const materialUrl = input.materialUrl.trim();
  return updateStep(path.id, stepId, (step) => ({
    ...step,
    title: title ?? step.title,
    duration: input.duration || step.duration,
    type: input.type,
    description: input.description.trim(),
    materialTitle: materialUrl ? (title ?? step.title) : "",
    materialUrl,
  }));
}
