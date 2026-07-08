/**
 * Calendar scheduling: map a path's ordered steps onto concrete dates.
 *
 * Deterministic, fully offline date math. Re-scheduling overwrites the previous
 * dates rather than duplicating, so a user can freely reschedule.
 */

import type { LearningPath } from "../domain/types";
import { savePath, updateStep } from "../repositories/pathRepository";

export interface ScheduleOptions {
  /** First step's date (YYYY-MM-DD). */
  startDate: string;
  /** Calendar days between consecutive steps. */
  daysBetween: number;
  /** Skip Saturdays and Sundays when true. */
  skipWeekends: boolean;
  /** Mark every Nth step (1-based) as a milestone; 0 disables. */
  milestoneEvery: number;
}

/** Format a Date as a YYYY-MM-DD local date string. */
function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Advance to the next weekday if the given date lands on a weekend. */
function nextWeekday(date: Date): Date {
  const result = new Date(date);
  while (result.getDay() === 0 || result.getDay() === 6) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

/** Assign calendar dates to every step of a path and persist the result. */
export async function schedulePath(
  path: LearningPath,
  options: ScheduleOptions,
): Promise<LearningPath> {
  let cursor = new Date(`${options.startDate}T00:00:00`);
  if (options.skipWeekends) cursor = nextWeekday(cursor);

  const steps = path.steps.map((step, index) => {
    const position = index + 1;
    const scheduled = {
      ...step,
      scheduledDate: toISODate(cursor),
      isMilestone: options.milestoneEvery > 0 && position % options.milestoneEvery === 0,
    };
    cursor.setDate(cursor.getDate() + Math.max(1, options.daysBetween));
    if (options.skipWeekends) cursor = nextWeekday(cursor);
    return scheduled;
  });

  const updated: LearningPath = {
    ...path,
    steps,
    updatedAt: new Date().toISOString(),
  };
  await savePath(updated);
  return updated;
}

/** Assign a single step to a specific calendar date, leaving the rest untouched. */
export async function scheduleStep(
  pathId: string,
  stepId: string,
  dateStr: string,
): Promise<LearningPath | undefined> {
  return updateStep(pathId, stepId, (step) => ({ ...step, scheduledDate: dateStr }));
}
