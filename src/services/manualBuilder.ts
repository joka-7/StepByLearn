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
import { savePath } from "../repositories/pathRepository";

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

/** Build a learning path from user-entered steps and material links, offline. */
export async function createManualPath(input: ManualPathInput): Promise<LearningPath> {
  const now = new Date().toISOString();

  const steps: PathStep[] = input.steps.map((step, index) => {
    const title = step.title.trim() || `Milestone ${index + 1}`;
    const materialUrl = step.materialUrl.trim();
    return {
      id: newId(),
      orderIndex: index,
      title,
      duration: step.duration || input.stepDuration,
      type: step.type,
      description:
        step.description.trim() ||
        "Study guide and exercise instructions for this milestone.",
      keyConcepts: [input.topic],
      materialTitle: materialUrl ? title : "",
      materialUrl,
      resources: [],
      status: "not_started",
      doneAt: null,
      scheduledDate: null,
      isMilestone: false,
    };
  });

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
