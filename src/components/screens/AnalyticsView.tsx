import { Award, BarChart3, FileText, Video, Volume2 } from "lucide-react";
import { motion } from "motion/react";
import type { LearningPath } from "../../domain/types";
import { summarize } from "../../services/progress";

interface Props {
  paths: LearningPath[];
}

/** Aggregate study analytics derived entirely from local path/step data. */
export function AnalyticsView({ paths }: Props) {
  const totalCourses = paths.length;
  const completedCoursesCount = paths.filter(
    (p) => p.steps.length > 0 && p.steps.every((s) => s.status === "done"),
  ).length;

  let totalStepsCount = 0;
  let completedStepsCount = 0;
  const studyFormatCounts = { text: 0, video: 0, podcast: 0 };
  let bestStreak = 0;

  paths.forEach((path) => {
    path.steps.forEach((step) => {
      totalStepsCount++;
      if (step.status === "done") {
        completedStepsCount++;
        studyFormatCounts[step.type]++;
      }
    });
    bestStreak = Math.max(bestStreak, summarize(path).streakDays);
  });

  const overallCompletionRate =
    totalStepsCount > 0 ? Math.round((100 * completedStepsCount) / totalStepsCount) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto space-y-8"
      id="view_analytics"
    >
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-indigo-400" />
          <span>My Learning Insights</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Visualize your study behaviors and content medium logs.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-2">
          <span className="text-[10px] text-slate-400 font-mono uppercase">Total Roadmaps</span>
          <p className="text-2xl font-bold text-white">{totalCourses}</p>
          <span className="text-[10px] text-emerald-400 block font-mono">
            {completedCoursesCount} Completed
          </span>
        </div>

        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-2">
          <span className="text-[10px] text-slate-400 font-mono uppercase">Lessons Completed</span>
          <p className="text-2xl font-bold text-indigo-400">{completedStepsCount}</p>
          <span className="text-[10px] text-slate-500 block font-mono">
            {totalStepsCount} scheduled total
          </span>
        </div>

        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-2">
          <span className="text-[10px] text-slate-400 font-mono uppercase">
            Workspace Completion
          </span>
          <p className="text-2xl font-bold text-white">{overallCompletionRate}%</p>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
            <div
              className="bg-indigo-500 h-full"
              style={{ width: `${overallCompletionRate}%` }}
            ></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="font-bold text-xs text-slate-200 uppercase tracking-wider font-mono">
            Completed Content Mediums
          </h3>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-blue-400" />
                  Text Tutorials
                </span>
                <span className="text-slate-200 font-bold">{studyFormatCounts.text} lessons</span>
              </div>
              <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-blue-400 h-full"
                  style={{
                    width: `${completedStepsCount > 0 ? (studyFormatCounts.text / completedStepsCount) * 100 : 0}%`,
                  }}
                ></div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Volume2 className="h-3.5 w-3.5 text-amber-400" />
                  Audio Podcasts
                </span>
                <span className="text-slate-200 font-bold">
                  {studyFormatCounts.podcast} lessons
                </span>
              </div>
              <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-amber-400 h-full"
                  style={{
                    width: `${completedStepsCount > 0 ? (studyFormatCounts.podcast / completedStepsCount) * 100 : 0}%`,
                  }}
                ></div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5 text-rose-400" />
                  Video Lectures
                </span>
                <span className="text-slate-200 font-bold">{studyFormatCounts.video} lessons</span>
              </div>
              <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-rose-400 h-full"
                  style={{
                    width: `${completedStepsCount > 0 ? (studyFormatCounts.video / completedStepsCount) * 100 : 0}%`,
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="font-bold text-xs text-slate-200 uppercase tracking-wider font-mono">
              Study Habit Guidelines
            </h3>

            <div className="space-y-3.5 text-xs text-slate-400">
              <div className="flex gap-3 items-start">
                <div className="h-5 w-5 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold font-mono shrink-0">
                  1
                </div>
                <p>
                  <strong>Maintain consistency</strong>: Access your Study Calendar daily to review
                  and tick off assigned checkpoints.
                </p>
              </div>

              <div className="flex gap-3 items-start">
                <div className="h-5 w-5 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold font-mono shrink-0">
                  2
                </div>
                <p>
                  <strong>Engage fully</strong>: Follow each step's material link out to the real
                  video, podcast, or article before marking it done.
                </p>
              </div>

              <div className="flex gap-3 items-start">
                <div className="h-5 w-5 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold font-mono shrink-0">
                  3
                </div>
                <p>
                  <strong>Iterate dynamically</strong>: Use the Manual Course Architect when you
                  wish to study offline with customized tasks.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-xl flex items-center gap-4 mt-6">
            <Award className="h-10 w-10 text-indigo-400 shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-200">
                {bestStreak > 0 ? "Study Streak Active!" : "Start your streak today"}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {bestStreak > 0
                  ? `You've logged study progress ${bestStreak} day${bestStreak === 1 ? "" : "s"} in a row.`
                  : "Mark a step done today to kick off a study streak."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
