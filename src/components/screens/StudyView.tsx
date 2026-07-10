import {
  ArrowLeft,
  BookOpen,
  Calendar as CalendarIcon,
  Check,
  FileText,
  Play,
  Plus,
  Video,
  Volume2,
} from "lucide-react";
import { useState, type ReactElement } from "react";
import type { ContentType, LearningPath } from "../../domain/types";
import { setStepStatus } from "../../services/progress";
import { AddStepModal } from "./study/AddStepModal";
import { StudyMaterialTab } from "./study/StudyMaterialTab";

interface Props {
  path: LearningPath;
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
  onGoToPlanner: () => void;
  hasKey: boolean;
  onNeedKey: () => void;
}

const TYPE_ICONS: Record<ContentType, ReactElement> = {
  text: <FileText className="h-3.5 w-3.5" />,
  video: <Video className="h-3.5 w-3.5" />,
  podcast: <Volume2 className="h-3.5 w-3.5" />,
};

const TYPE_PILL_CLASS: Record<ContentType, string> = {
  text: "bg-blue-500/15 text-blue-300",
  video: "bg-rose-500/15 text-rose-300",
  podcast: "bg-amber-500/15 text-amber-300",
};

/** The Active Study Desk: step list on the left, tabbed workspace on the right. */
export function StudyView({
  path,
  selectedStepId,
  onSelectStep,
  onGoToPlanner,
  hasKey,
  onNeedKey,
}: Props) {
  const activeStep = path.steps.find((s) => s.id === selectedStepId) ?? null;
  // On mobile the list and detail don't fit side by side; this only controls
  // which of the two is shown there (desktop always shows both).
  const [showListOnMobile, setShowListOnMobile] = useState(false);
  const [showAddStep, setShowAddStep] = useState(false);
  const showDetail = activeStep && !showListOnMobile;

  async function toggleCompleted() {
    if (!activeStep) return;
    const done = activeStep.status === "done";
    await setStepStatus(path.id, activeStep.id, done ? "not_started" : "done");
  }

  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8" id="view_study">
      <div
        className={`${showDetail ? "hidden lg:block" : "block"} lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl max-h-[calc(100vh-200px)] overflow-y-auto`}
      >
        <h3 className="font-bold text-xs text-slate-400 uppercase tracking-wider font-mono">
          Curriculum Progression
        </h3>

        <div className="relative mt-4 pl-2">
          <div className="absolute left-[19px] top-4 bottom-4 w-px bg-slate-700" aria-hidden />

          {path.steps.map((step, idx) => {
            const isActive = step.id === selectedStepId;
            const done = step.status === "done";

            return (
              <div
                key={step.id}
                className={`relative flex items-start gap-3 p-3 cursor-pointer transition-all rounded-xl ${
                  isActive ? "bg-slate-800/60" : ""
                }`}
                onClick={() => {
                  onSelectStep(step.id);
                  setShowListOnMobile(false);
                }}
              >
                <div
                  className={`relative z-10 h-8 w-8 rounded-full flex items-center justify-center shrink-0 border-2 ${
                    done
                      ? "bg-blue-600 border-blue-600 text-white"
                      : isActive
                        ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/30"
                        : "bg-slate-900 border-slate-700 text-slate-500"
                  }`}
                >
                  {done ? (
                    <Check className="h-4 w-4 stroke-[3]" />
                  ) : isActive ? (
                    <Play className="h-3.5 w-3.5 fill-current" />
                  ) : (
                    TYPE_ICONS[step.type]
                  )}
                </div>

                <div className="space-y-1 min-w-0 flex-1 pt-1">
                  <p
                    className={`text-xs font-bold leading-snug ${isActive ? "text-white" : "text-slate-300"}`}
                  >
                    {idx + 1}. {step.title}
                  </p>
                  <span
                    className={`inline-flex items-center gap-1 text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-full capitalize ${TYPE_PILL_CLASS[step.type]}`}
                  >
                    {TYPE_ICONS[step.type]}
                    {step.type}
                  </span>
                  {step.scheduledDate && (
                    <div className="flex items-center gap-1 text-[9px] text-slate-500 font-mono">
                      <CalendarIcon className="h-2.5 w-2.5" />
                      <span>Scheduled: {step.scheduledDate}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button
          id="desk_add_step_btn"
          type="button"
          onClick={() => setShowAddStep(true)}
          className="w-full mt-3 text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-semibold py-2.5 rounded-xl border border-blue-500/20 flex items-center justify-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Study Step</span>
        </button>
      </div>

      {showAddStep && (
        <AddStepModal
          path={path}
          hasKey={hasKey}
          onNeedKey={onNeedKey}
          onClose={() => setShowAddStep(false)}
        />
      )}

      <div className={`${showDetail ? "block" : "hidden lg:block"} lg:col-span-8 flex flex-col gap-6`}>
        {activeStep ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex-1 flex flex-col">
            <button
              id="desk_back_to_list_btn"
              onClick={() => setShowListOnMobile(true)}
              className="lg:hidden flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 mb-4 -mt-1 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Curriculum</span>
            </button>
            <div className="border-b border-slate-800 pb-5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Study Milestone: {activeStep.title}
                </h2>
                <button
                  id="toggle_step_completed_desk_btn"
                  onClick={toggleCompleted}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    activeStep.status === "done"
                      ? "bg-blue-600 text-white"
                      : "bg-blue-600 hover:bg-blue-500 text-white"
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{activeStep.status === "done" ? "Completed" : "Mark as Completed"}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
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
              Select an existing course or create a new AI-generated or manual roadmap to launch
              your workspace.
            </p>
            <button
              id="desk_open_planner_btn"
              onClick={onGoToPlanner}
              className="mt-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors"
            >
              Go to Planner
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
