/**
 * Offline progression tracking: mark steps done and derive completion stats.
 *
 * Every operation reads/writes only IndexedDB — no network — so progress works
 * fully offline. Streaks and percentages are computed from stored `doneAt`
 * timestamps.
 */

import type { LearningPath, StepStatus } from "../domain/types";
import { updateStep } from "../repositories/pathRepository";

export interface ProgressSummary {
  totalSteps: number;
  doneSteps: number;
  percentComplete: number;
  nextStepId: string | null;
  streakDays: number;
}

/** Set a step's status, stamping `doneAt` on completion and clearing it otherwise. */
export async function setStepStatus(
  pathId: string,
  stepId: string,
  status: StepStatus,
): Promise<LearningPath | undefined> {
  const now = new Date().toISOString();
  return updateStep(pathId, stepId, (step) => ({
    ...step,
    status,
    // Set doneAt only on completion; clear it when reopened so a reopened step
    // never counts toward the streak.
    doneAt: status === "done" ? now : null,
  }));
}

/** Compute a completion summary for a path (entirely from local data). */
export function summarize(path: LearningPath): ProgressSummary {
  const total = path.steps.length;
  const done = path.steps.filter((s) => s.status === "done");
  const next = path.steps.find((s) => s.status !== "done");
  const percent = total === 0 ? 0 : Math.round((100 * done.length) / total);

  return {
    totalSteps: total,
    doneSteps: done.length,
    percentComplete: percent,
    nextStepId: next?.id ?? null,
    streakDays: streakDays(done.map((s) => s.doneAt)),
  };
}

/** Count consecutive days ending today that have at least one completion. */
function streakDays(timestamps: (string | null)[]): number {
  const doneDates = new Set(
    timestamps.filter((t): t is string => t !== null).map((t) => t.slice(0, 10)),
  );
  if (doneDates.size === 0) return 0;

  const today = new Date();
  let streak = 0;
  const cursor = new Date(today);
  // A streak must include today; otherwise it has already been broken.
  while (doneDates.has(toISODate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
