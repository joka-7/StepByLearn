import { AlertCircle, ListPlus, Sparkles, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { ContentType, LearningPath } from "../../../domain/types";
import { closeViaHistoryBack, useBackClose } from "../../../hooks/useBackClose";
import { generateAdditionalSteps } from "../../../services/generation";
import { addManualStep } from "../../../services/manualBuilder";

interface Props {
  path: LearningPath;
  hasKey: boolean;
  onNeedKey: () => void;
  onClose: () => void;
}

type Mode = "manual" | "ai";

/** Add one or more new steps to an existing course — by hand or via the AI agent. */
export function AddStepModal({ path, hasKey, onNeedKey, onClose }: Props) {
  useBackClose(true, onClose);
  const [mode, setMode] = useState<Mode>("manual");

  // Manual tab state
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ContentType>("text");
  const [duration, setDuration] = useState(path.stepDuration || "30 minutes");
  const [description, setDescription] = useState("");
  const [materialUrl, setMaterialUrl] = useState("");
  const [savingManual, setSavingManual] = useState(false);

  // AI tab state
  const [instruction, setInstruction] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  async function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSavingManual(true);
    try {
      await addManualStep(path, { title, type, duration, description, materialUrl });
      closeViaHistoryBack();
    } finally {
      setSavingManual(false);
    }
  }

  async function handleAiSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hasKey) {
      onNeedKey();
      return;
    }
    setIsGenerating(true);
    setGenerationError(null);
    try {
      await generateAdditionalSteps(path, instruction.trim());
      closeViaHistoryBack();
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={closeViaHistoryBack}
    >
      <div
        className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
        id="add_step_modal"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Add Study Step</h2>
          <button
            onClick={closeViaHistoryBack}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl">
          <button
            type="button"
            id="add_step_mode_manual_btn"
            onClick={() => setMode("manual")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              mode === "manual" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ListPlus className="h-3.5 w-3.5" />
            <span>Add Manually</span>
          </button>
          <button
            type="button"
            id="add_step_mode_ai_btn"
            onClick={() => setMode("ai")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              mode === "ai" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Ask AI Agent</span>
          </button>
        </div>

        {mode === "manual" ? (
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Step Title
              </label>
              <input
                id="add_step_title_input"
                type="text"
                required
                placeholder="e.g. Generics: Writing Reusable Code"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500 placeholder:text-slate-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Content Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as ContentType)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500"
                >
                  <option value="text">Text Tutorial</option>
                  <option value="video">Video Study</option>
                  <option value="podcast">Podcast Audio</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Duration
                </label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500"
                >
                  <option value="15 minutes">15 Minutes</option>
                  <option value="30 minutes">30 Minutes</option>
                  <option value="45 minutes">45 Minutes</option>
                  <option value="1 hour">1 Hour</option>
                  <option value="2 hours">2 Hours</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Description
              </label>
              <input
                type="text"
                placeholder="Brief description / instructions"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500 placeholder:text-slate-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Material URL (optional)
              </label>
              <input
                type="url"
                placeholder="A real link to the video/podcast/article for this step"
                value={materialUrl}
                onChange={(e) => setMaterialUrl(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500 placeholder:text-slate-600"
              />
            </div>

            <button
              id="add_step_manual_submit_btn"
              type="submit"
              disabled={savingManual}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-lg shadow-blue-600/10"
            >
              {savingManual ? "Adding…" : "Add Step"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleAiSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                What should the next step(s) cover?
              </label>
              <textarea
                id="add_step_ai_instruction_textarea"
                placeholder="e.g. Add a step on generics, or just continue with the next logical topic"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500 placeholder:text-slate-600 resize-none"
              />
              <p className="text-[10px] text-slate-500 mt-1.5">
                Leave blank to let the agent continue the course with the next logical step(s).
              </p>
            </div>

            <button
              id="add_step_ai_submit_btn"
              type="submit"
              disabled={isGenerating}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-lg shadow-blue-600/10 flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Drafting new step(s)…</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Generate Step(s)</span>
                </>
              )}
            </button>

            {generationError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-lg text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">AI Generation Failed</p>
                  <p className="text-[10px] text-rose-400/90 mt-0.5">{generationError}</p>
                </div>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
