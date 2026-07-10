/**
 * Path generation use-case: resolve key/model -> generate -> heal -> persist.
 *
 * Ties the AI driver to the repository. The resulting path plus all its steps is
 * written in a single `savePath` call (one IndexedDB document), so it is
 * inherently atomic.
 */

import { healAndValidate, healAndValidateSteps } from "../ai/jsonHealer";
import { SYSTEM_INSTRUCTION, buildAdditionalStepsPrompt, buildSyllabusPrompt } from "../ai/prompts";
import { resolveStrategy } from "../ai/resolver";
import { newId } from "../domain/ids";
import type { ContentType, Difficulty, LearningPath, PathStep } from "../domain/types";
import { appendSteps, savePath } from "../repositories/pathRepository";
import { getApiKey, getSettings } from "../repositories/settingsRepository";

export interface GeneratePathOptions {
  /** Target time per step, e.g. "45 minutes". */
  stepDuration: string;
  /** Preferred content format, or "all" to let the model choose per step. */
  contentType: ContentType | "all";
  /** The learner's self-described background; empty string if unspecified. */
  currentKnowledge: string;
}

/** Generate a learning path for a topic and persist it locally. */
export async function generatePath(
  topic: string,
  difficulty: Difficulty,
  options: GeneratePathOptions,
): Promise<LearningPath> {
  const settings = await getSettings();
  const provider = settings.provider;
  const model = settings.models[provider];
  const apiKey = getApiKey(provider) ?? "";

  const strategy = resolveStrategy(provider, apiKey, model);
  const raw = await strategy.generateText(
    buildSyllabusPrompt(topic, difficulty, options),
    SYSTEM_INSTRUCTION,
  );
  const draft = healAndValidate(raw);

  const now = new Date().toISOString();
  const pathId = newId();

  // orderIndex is assigned here (not trusted from the model) so ordering is
  // always dense and zero-based.
  const steps: PathStep[] = draft.steps.map((step, index) => ({
    id: newId(),
    orderIndex: index,
    title: step.title,
    duration: step.duration,
    type: step.type,
    description: step.description,
    keyConcepts: step.keyConcepts,
    materialTitle: step.materialTitle,
    materialUrl: step.materialUrl,
    resources: step.resources,
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
    modelName: model,
    stepDuration: options.stepDuration,
    contentType: options.contentType,
    currentKnowledge: options.currentKnowledge,
    steps,
    createdAt: now,
    updatedAt: now,
  };

  await savePath(path);
  return path;
}

/**
 * Ask the AI agent to draft one or more additional steps for an existing
 * path, matching its established tone/format, and append them.
 */
export async function generateAdditionalSteps(
  path: LearningPath,
  instruction: string,
): Promise<PathStep[]> {
  const settings = await getSettings();
  const provider = settings.provider;
  const model = settings.models[provider];
  const apiKey = getApiKey(provider) ?? "";

  const strategy = resolveStrategy(provider, apiKey, model);
  const raw = await strategy.generateText(
    buildAdditionalStepsPrompt(
      path.title,
      path.topic,
      path.steps.map((s) => s.title),
      instruction,
      {
        stepDuration: path.stepDuration,
        contentType: path.contentType,
        currentKnowledge: path.currentKnowledge,
      },
    ),
    SYSTEM_INSTRUCTION,
  );
  const drafts = healAndValidateSteps(raw);

  const startIndex = path.steps.length;
  const steps: PathStep[] = drafts.map((step, index) => ({
    id: newId(),
    orderIndex: startIndex + index,
    title: step.title,
    duration: step.duration,
    type: step.type,
    description: step.description,
    keyConcepts: step.keyConcepts,
    materialTitle: step.materialTitle,
    materialUrl: step.materialUrl,
    resources: step.resources,
    status: "not_started",
    doneAt: null,
    scheduledDate: null,
    isMilestone: false,
  }));

  await appendSteps(path.id, steps);
  return steps;
}
