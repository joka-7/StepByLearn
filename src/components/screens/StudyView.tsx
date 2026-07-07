import { BookOpen, Calendar as CalendarIcon, Check, Clock, FileText, Video, Volume2 } from "lucide-react";
import type { ReactElement } from "react";
import type { ContentType, LearningPath } from "../../domain/types";
import { setStepStatus } from "../../services/progress";
import { StudyMaterialTab } from "./study/StudyMaterialTab";

interface Props {
  path: LearningPath;
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
  onGoToPlanner: () => void;
}

const FORMAT_ICONS: Record<ContentType, ReactElement> = {
  text: <FileText className="h-3.5 w-3.5 text-blue-400" />,
  video: <Video className="h-3.5 w-3.5 text-rose-400" />,
  podcast: <Volume2 className="h-3.5 w-3.5 text-amber-400" />,
};

/** The Active Study Desk: step list on the left, tabbed workspace on the right. */
export function StudyView({ path, selectedStepId, onSelectStep, onGoToPlanner }: Props) {
  const activeStep = path.steps.find((s) => s.id === selectedStepId) ?? null;

  async function toggleCompleted() {
    if (!activeStep) return;
    const done = activeStep.status === "done";
    await setStepStatus(path.id, activeStep.id, done ? "not_started" : "done");
  }

  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8" id="view_study">
      <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
        <div>
          <h3 className="font-bold text-xs text-slate-400 uppercase tracking-wider font-mono">
            Curriculum Progression
          </h3>
          <h2 className="text-lg font-bold text-white mt-1 line-clamp-2">{path.title}</h2>
        </div>

        <div className="space-y-3 pt-2">
          {path.steps.map((step, idx) => {
            const isActive = step.id === selectedStepId;
            const done = step.status === "done";

            return (
              <div
                key={step.id}
                className={`p-3.5 rounded-xl border relative transition-all cursor-pointer ${
                  isActive
                    ? "bg-slate-800/80 border-indigo-500"
                    : "bg-slate-950 border-slate-800 hover:border-slate-700"
                }`}
                onClick={() => onSelectStep(step.id)}
              >
                <div className="flex items-start gap-3">
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setStepStatus(path.id, step.id, done ? "not_started" : "done");
                    }}
                    className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                      done
                        ? "bg-emerald-500 border-emerald-400 text-slate-950"
                        : "border-slate-700 hover:border-slate-500"
                    }`}
                  >
                    {done && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                  </div>

                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-200 leading-snug line-clamp-2">
                      {idx + 1}. {step.title}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="h-3 w-3" />
                        {step.duration}
                      </span>
                      <span className="flex items-center gap-1 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono capitalize">
                        {FORMAT_ICONS[step.type]}
                        {step.type}
                      </span>
                    </div>
                    {step.scheduledDate && (
                      <div className="flex items-center gap-1 mt-1.5 text-[9px] text-indigo-400 font-mono">
                        <CalendarIcon className="h-2.5 w-2.5" />
                        <span>Scheduled: {step.scheduledDate}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="lg:col-span-8 flex flex-col gap-6">
        {activeStep ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex-1 flex flex-col">
            <div className="border-b border-slate-800 pb-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-mono tracking-widest text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded">
                  Study Milestone
                </span>
                <button
                  id="toggle_step_completed_desk_btn"
                  onClick={toggleCompleted}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    activeStep.status === "done"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700"
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{activeStep.status === "done" ? "Completed" : "Mark as Completed"}</span>
                </button>
              </div>

              <h2 className="text-xl font-bold text-white tracking-tight">{activeStep.title}</h2>
              <p className="text-slate-400 text-xs leading-relaxed">{activeStep.description}</p>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                {activeStep.keyConcepts.map((concept, i) => (
                  <span
                    key={i}
                    className="text-[10px] font-mono text-slate-300 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800/80"
                  >
                    #{concept}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex-1 pt-5">
              <StudyMaterialTab step={activeStep} />
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl text-center py-20">
            <BookOpen className="h-12 w-12 text-slate-700 mx-auto mb-4" />
            <h3 className="font-bold text-sm text-slate-300">No Step Loaded</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-2">
              Select an existing course or create a new AI-generated or manual roadmap
              to launch your workspace.
            </p>
            <button
              id="desk_open_planner_btn"
              onClick={onGoToPlanner}
              className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors"
            >
              Go to Planner
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
