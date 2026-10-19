/**
 * Calendar scheduling: map a path's ordered steps onto concrete dates.
 *
 * Deterministic, fully offline date math. Re-scheduling overwrites the previous
 * dates rather than duplicating, so a user can freely reschedule.
 */

import { toLocalISODate } from "../domain/dates";
import type { LearningPath, PathStep } from "../domain/types";
import { updatePath, updateStep } from "../repositories/pathRepository";

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

/** Advance to the next weekday if the given date lands on a weekend. */
function nextWeekday(date: Date): Date {
  const result = new Date(date);
  while (result.getDay() === 0 || result.getDay() === 6) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

export class InvalidScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidScheduleError";
  }
}

function validate(options: ScheduleOptions): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(options.startDate) ||
    Number.isNaN(Date.parse(options.startDate))
  ) {
    throw new InvalidScheduleError(`Start date must be YYYY-MM-DD, got "${options.startDate}".`);
  }
  if (!Number.isInteger(options.daysBetween) || options.daysBetween < 1) {
    throw new InvalidScheduleError("Days between steps must be a whole number of at least 1.");
  }
  if (!Number.isInteger(options.milestoneEvery) || options.milestoneEvery < 0) {
    throw new InvalidScheduleError("Milestone interval must be a whole number of 0 or more.");
  }
}

/** Pure date assignment: give each step, in order, its scheduled day and milestone flag. */
export function assignDates(steps: readonly PathStep[], options: ScheduleOptions): PathStep[] {
  validate(options);
  let cursor = new Date(`${options.startDate}T00:00:00`);
  if (options.skipWeekends) cursor = nextWeekday(cursor);

  return steps.map((step, index) => {
    const position = index + 1;
    const scheduled = {
      ...step,
      scheduledDate: toLocalISODate(cursor),
      isMilestone: options.milestoneEvery > 0 && position % options.milestoneEvery === 0,
    };
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + options.daysBetween,
    );
    if (options.skipWeekends) cursor = nextWeekday(cursor);
    return scheduled;
  });
}

/** Assign calendar dates to every step of a path and persist the result. */
export async function schedulePath(
  pathId: string,
  options: ScheduleOptions,
): Promise<LearningPath | undefined> {
  validate(options);
  return updatePath(pathId, (path) => ({ ...path, steps: assignDates(path.steps, options) }));
}

/** Assign a single step to a specific calendar date, leaving the rest untouched. */
export async function scheduleStep(
  pathId: string,
  stepId: string,
  dateStr: string,
): Promise<LearningPath | undefined> {
  return updateStep(pathId, stepId, (step) => ({ ...step, scheduledDate: dateStr }));
}
