import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bookmark,
  BookOpen,
  CheckSquare,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { EXTERNAL_CHAT_PROVIDERS } from "@joka-7/modeldispatcher-browser-agent";
import type { ContentType, Difficulty, LearningPath } from "../../domain/types";
import { schedulePath } from "../../services/calendar";
import { generatePath } from "../../services/generation";

/** Best-effort clipboard copy — never throws (permissions/non-secure context). */
function copyToClipboard(text: string): void {
  navigator.clipboard?.writeText(text).catch(() => {});
}

/** The same syllabus request generatePath() would have sent, phrased as a
 * plain question — what a failed generation hands off to an external AI. */
function buildSyllabusQuestion(
  topic: string,
  difficulty: Difficulty,
  stepDuration: string,
  currentKnowledge: string,
): string {
  const background = currentKnowledge.trim()
    ? ` My current knowledge: ${currentKnowledge.trim()}.`
    : "";
  return (
    `Create a step-by-step learning path for "${topic}" at ${difficulty} level, ` +
    `with each step taking about ${stepDuration}. Include real videos, articles, ` +
    `or other resources for each step.${background}`
  );
}

interface Props {
  paths: LearningPath[];
  hasKey: boolean;
  onNeedKey: () => void;
  onGenerated: (path: LearningPath) => void;
  onSelectPath: (id: string) => void;
  onOpenStudyDesk: () => void;
  selectedPathId: string | null;
}

const LOADING_STEPS = [
  "Analyzing your target topic & previous knowledge...",
  "Drafting structured milestones & timeline constraints...",
  "Sourcing real videos, podcasts, and articles per step...",
  "Cross-checking links against well-known, stable sources...",
  "Structuring in-app study planner & calendar dates...",
];

/** Auto-schedule generated steps starting tomorrow, one per day. */
async function autoSchedule(path: LearningPath): Promise<void> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await schedulePath(path, {
    startDate: tomorrow.toISOString().slice(0, 10),
    daysBetween: 1,
    skipWeekends: false,
    milestoneEvery: 0,
  });
}

/** The Workspace Planner: AI generation form plus the course library. */
export function DashboardView({
  paths,
  hasKey,
  onNeedKey,
  onGenerated,
  onSelectPath,
  onOpenStudyDesk,
  selectedPathId,
}: Props) {
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const [stepDuration, setStepDuration] = useState("45 minutes");
  const [contentType, setContentType] = useState<ContentType | "all">("all");
  const [currentKnowledge, setCurrentKnowledge] = useState("");
  const [useCalendar, setUseCalendar] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isGenerating) return;
    const interval = setInterval(() => {
      setGenerationStep((prev) => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
    }, 2500);
    return () => clearInterval(interval);
  }, [isGenerating]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!topic.trim()) return;
    if (!hasKey) {
      onNeedKey();
      return;
    }

    setIsGenerating(true);
    setGenerationStep(0);
    setGenerationError(null);
    try {
      const path = await generatePath(topic.trim(), difficulty, {
        stepDuration,
        contentType,
        currentKnowledge,
      });
      if (useCalendar) await autoSchedule(path);

      setTopic("");
      setCurrentKnowledge("");
      onGenerated(path);
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  const totalSteps = paths.reduce((sum, p) => sum + p.steps.length, 0);
  const completedSteps = paths.reduce(
    (sum, p) => sum + p.steps.filter((s) => s.status === "done").length,
    0,
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-8"
      id="view_dashboard"
    >
      <div className="bg-gradient-to-r from-blue-950 to-slate-900 rounded-3xl p-6 md:p-8 border border-blue-500/20 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Sparkles className="h-40 w-40 text-blue-500" />
        </div>
        <div className="max-w-xl space-y-3 relative z-10">
          <span className="text-[10px] font-mono tracking-widest bg-blue-500/20 border border-blue-500/30 text-blue-300 px-3 py-1 rounded-full uppercase">
            Dynamic Knowledge Generator
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            What do you want to learn today?
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            Instantly build custom learning roadmaps. Use our AI agent to curate real videos,
            podcasts, and articles for each step, or define your milestones completely offline.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100">Plan with AI Agent</h3>
              <p className="text-[11px] text-slate-400">
                Generate structured curriculums instantly
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                What topic do you want to master?
              </label>
              <input
                id="ai_form_topic_input"
                type="text"
                required
                placeholder="e.g. Rust ownership, or learn TypeScript knowing Python"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500 placeholder:text-slate-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Difficulty
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Study Duration per Step
                </label>
                <select
                  id="ai_form_duration_select"
                  value={stepDuration}
                  onChange={(e) => setStepDuration(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500"
                >
                  <option value="15 minutes">15 Minutes</option>
                  <option value="30 minutes">30 Minutes</option>
                  <option value="45 minutes">45 Minutes</option>
                  <option value="1 hour">1 Hour</option>
                  <option value="2 hours">2 Hours</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Primary Content Type
                </label>
                <select
                  id="ai_form_type_select"
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value as ContentType | "all")}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500"
                >
                  <option value="all">All media types</option>
                  <option value="text">Text only</option>
                  <option value="podcast">Podcast only</option>
                  <option value="video">Video only</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Your Current Knowledge / Background
              </label>
              <textarea
                id="ai_form_knowledge_textarea"
                placeholder="e.g. I am a Python developer and know classes, functions, and dynamic typing"
                value={currentKnowledge}
                onChange={(e) => setCurrentKnowledge(e.target.value)}
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500 placeholder:text-slate-600 resize-none"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <input
                  id="ai_form_calendar_checkbox"
                  type="checkbox"
                  checked={useCalendar}
                  onChange={(e) => setUseCalendar(e.target.checked)}
                  className="h-4 w-4 bg-slate-950 rounded text-blue-600 border-slate-800"
                />
                <label
                  htmlFor="ai_form_calendar_checkbox"
                  className="text-xs text-slate-300 select-none cursor-pointer"
                >
                  Auto-schedule in workspace calendar
                </label>
              </div>
            </div>

            <button
              id="ai_form_submit_btn"
              type="submit"
              disabled={isGenerating}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-4 rounded-xl text-xs transition-colors shadow-lg shadow-blue-600/10 flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>AI Agent is drafting course...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Generate Custom Learning Plan</span>
                </>
              )}
            </button>

            {generationError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-lg text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">AI Generation Failed</p>
                  <p className="text-[10px] text-rose-400/90 mt-0.5">{generationError}</p>
                  <p className="text-[10px] text-slate-300 mt-2 font-medium">
                    ✨ Tip: You can immediately build custom offline courses using the "Manual
                    Course Architect" tab on the sidebar without needing API keys!
                  </p>
                  {topic.trim() && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-[10px] text-slate-400">
                      <span>Or ask directly:</span>
                      {Object.values(EXTERNAL_CHAT_PROVIDERS).map((provider) => {
                        const question = buildSyllabusQuestion(
                          topic,
                          difficulty,
                          stepDuration,
                          currentKnowledge,
                        );
                        const url = provider.buildUrl
                          ? provider.buildUrl(question)
                          : provider.homeUrl;
                        return (
                          <a
                            key={provider.id}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => copyToClipboard(question)}
                            className="font-semibold text-blue-400 hover:text-blue-300 underline"
                          >
                            {provider.name}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <h3 className="font-bold text-xs text-slate-200 uppercase tracking-wider font-mono">
              Workspace Status
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 relative">
                <span className="text-[10px] text-slate-500">My Courses</span>
                <p className="text-xl font-bold text-white mt-1">{paths.length}</p>
                <Bookmark className="h-3.5 w-3.5 text-blue-400 absolute top-3.5 right-3.5" />
              </div>
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80">
                <span className="text-[10px] text-slate-500">Completed Steps</span>
                <p className="text-xl font-bold text-white mt-1">
                  {completedSteps} / {totalSteps}
                </p>
                <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden mt-2">
                  <div
                    className="bg-blue-500 h-full"
                    style={{
                      width: `${totalSteps > 0 ? Math.round((100 * completedSteps) / totalSteps) : 0}%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex-1 flex flex-col justify-between min-h-[300px]">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-emerald-400" />
                  <h3 className="font-bold text-sm text-slate-100">Course Library</h3>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">{paths.length} loaded</span>
              </div>

              <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                {paths.length === 0 ? (
                  <div className="text-center py-8">
                    <BookOpen className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-xs text-slate-400">Your study deck is empty.</p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Generate an AI course above, or create one manually offline!
                    </p>
                  </div>
                ) : (
                  paths.map((path) => {
                    const done = path.steps.filter((s) => s.status === "done").length;
                    const total = path.steps.length;
                    const progress = total > 0 ? Math.round((100 * done) / total) : 0;
                    const isSelected = path.id === selectedPathId;

                    return (
                      <div
                        key={path.id}
                        onClick={() => onSelectPath(path.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? "bg-slate-800/80 border-blue-500"
                            : "bg-slate-950 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="space-y-1 min-w-0 pr-3">
                          <p className="text-xs font-bold text-slate-200 line-clamp-1">
                            {path.title}
                          </p>
                          {path.description && (
                            <p className="text-[10px] text-slate-500 line-clamp-1">
                              {path.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                            <span>{total} steps</span>
                            <span>·</span>
                            <span>{path.stepDuration} per lesson</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <span className="text-[10px] font-mono font-bold text-blue-400">
                              {progress}%
                            </span>
                            <div className="w-12 bg-slate-800 h-1 rounded-full overflow-hidden mt-1">
                              <div
                                className="bg-blue-500 h-full"
                                style={{ width: `${progress}%` }}
                              ></div>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-600" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {selectedPathId && (
              <button
                id="dashboard_go_to_desk_btn"
                onClick={onOpenStudyDesk}
                className="w-full mt-4 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium py-2 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <span>Open Active Study Desk</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="max-w-md space-y-6">
              <div className="relative">
                <div className="h-20 w-20 rounded-full border-4 border-blue-500/10 border-t-blue-500 animate-spin mx-auto"></div>
                <Sparkles className="h-8 w-8 text-blue-400 animate-pulse absolute inset-0 m-auto" />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white">Generating Personalized Roadmap</h3>
                <p className="text-blue-400 text-xs font-semibold font-mono animate-pulse uppercase tracking-wider">
                  {LOADING_STEPS[generationStep]}
                </p>
                <p className="text-slate-500 text-[11px] max-w-xs mx-auto">
                  Our AI agent is curating real study material for each step.
                </p>
              </div>

              <div className="flex justify-center gap-1.5">
                {LOADING_STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                      i <= generationStep ? "bg-blue-500 w-4" : "bg-slate-800"
                    }`}
                  ></div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
