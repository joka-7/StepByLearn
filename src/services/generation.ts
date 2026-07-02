/**
 * Path generation use-case: resolve key/model -> generate -> heal -> persist.
 *
 * Ties the AI driver to the repository. The resulting path plus all its steps is
 * written in a single `savePath` call (one IndexedDB document), so it is
 * inherently atomic.
 */

import { generateSyllabusText } from "../ai/anthropicClient";
import { healAndValidate } from "../ai/jsonHealer";
import { newId } from "../domain/ids";
import type { Difficulty, LearningPath, PathStep } from "../domain/types";
import { savePath } from "../repositories/pathRepository";
import { getApiKey, getSettings } from "../repositories/settingsRepository";

/** Generate a learning path for a topic and persist it locally. */
export async function generatePath(
  topic: string,
  difficulty: Difficulty,
): Promise<LearningPath> {
  const apiKey = getApiKey() ?? "";
  const settings = await getSettings();

  const raw = await generateSyllabusText(apiKey, settings.cloudModel, topic, difficulty);
  const draft = healAndValidate(raw);

  const now = new Date().toISOString();
  const pathId = newId();

  // orderIndex is assigned here (not trusted from the model) so ordering is
  // always dense and zero-based.
  const steps: PathStep[] = draft.steps.map((step, index) => ({
    id: newId(),
    orderIndex: index,
    title: step.title,
    content: step.content,
    resources: step.resources,
    estimatedMinutes: step.estimatedMinutes,
    status: "not_started",
    doneAt: null,
    scheduledDate: null,
    isMilestone: false,
  }));

  const path: LearningPath = {
    id: pathId,
    title: draft.title,
    topic: draft.topic || topic,
    description: draft.description,
    difficulty: draft.difficulty,
    estimatedHours: draft.estimatedHours,
    modelName: settings.cloudModel,
    steps,
    createdAt: now,
    updatedAt: now,
  };

  await savePath(path);
  return path;
}
