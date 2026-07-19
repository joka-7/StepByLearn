import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import type { ContentType, LearningPath, LearningResource, PathStep } from "../../../domain/types";
import { closeViaHistoryBack, useBackClose } from "../../../hooks/useBackClose";
import { regenerateStep } from "../../../services/generation";
import { editManualStep } from "../../../services/manualBuilder";

const BLANK_RESOURCE: LearningResource = {
  title: "",
  type: "text",
  description: "",
  duration: "",
  url: "",
};

interface Props {
  path: LearningPath;
  step: PathStep;
  hasKey: boolean;
  onNeedKey: () => void;
  onClose: () => void;
}

type Mode = "manual" | "ai";

/** Fix an existing study step in place — by hand or via the AI agent — without touching progress. */
export function EditStepModal({ path, step, hasKey, onNeedKey, onClose }: Props) {
  useBackClose(true, onClose);
  const [mode, setMode] = useState<Mode>("manual");

  // Manual tab state, pre-filled from the current step.
  const [title, setTitle] = useState(step.title);
  const [type, setType] = useState<ContentType>(step.type);
  const [duration, setDuration] = useState(step.duration);
  const [description, setDescription] = useState(step.description);
  const [materialUrl, setMaterialUrl] = useState(step.materialUrl);
  const [resources, setResources] = useState<LearningResource[]>(step.resources);
  const [savingManual, setSavingManual] = useState(false);

  function updateResource(index: number, field: keyof LearningResource, value: string) {
    setResources((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function addResource() {
    setResources((prev) => [...prev, { ...BLANK_RESOURCE }]);
  }

  function removeResource(index: number) {
    setResources((prev) => prev.filter((_, i) => i !== index));
  }

  // AI tab state
  const [instruction, setInstruction] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  // What the agent actually returned, so the fix is visible before trusting it —
  // rather than the modal just closing and leaving the user to discover a still-broken link.
  const [aiResult, setAiResult] = useState<PathStep | null>(null);

  async function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSavingManual(true);
    try {
      const cleanedResources = resources
        .map((r) => ({ ...r, title: r.title.trim(), url: r.url.trim() }))
        .filter((r) => r.title);
      await editManualStep(path, step.id, {
        title,
        type,
        duration,
        description,
        materialUrl,
        resources: cleanedResources,
      });
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
      const updatedPath = await regenerateStep(path, step, instruction.trim());
      const updatedStep = updatedPath?.steps.find((s) => s.id === step.id);
      if (!updatedStep) {
        setGenerationError("Could not find the step to update — it may have been deleted.");
        return;
      }
      setAiResult(updatedStep);
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
        id="edit_step_modal"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Edit Study Step</h2>
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
            id="edit_step_mode_manual_btn"
            onClick={() => {
              setMode("manual");
              setAiResult(null);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              mode === "manual" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>Edit Manually</span>
          </button>
          <button
            type="button"
            id="edit_step_mode_ai_btn"
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
                id="edit_step_title_input"
                type="text"
                required
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
                Material URL
              </label>
              <input
                type="url"
                placeholder="A real link to the video/podcast/article for this step"
                value={materialUrl}
                onChange={(e) => setMaterialUrl(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500 placeholder:text-slate-600"
              />
              <p className="text-[10px] text-slate-500 mt-1.5">
                Clear this to remove the broken link — the step keeps its progress either way.
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-300">
                  Additional Resources
                </label>
                <button
                  id="edit_step_add_resource_btn"
                  type="button"
                  onClick={addResource}
                  className="flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  <span>Add Resource</span>
                </button>
              </div>

              {resources.length === 0 ? (
                <p className="text-[10px] text-slate-500">No supplementary resources.</p>
              ) : (
                <div className="space-y-2">
                  {resources.map((res, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2"
                    >
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Resource title"
                          value={res.title}
                          onChange={(e) => updateResource(idx, "title", e.target.value)}
                          className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500 placeholder:text-slate-600"
                        />
                        <select
                          value={res.type}
                          onChange={(e) => updateResource(idx, "type", e.target.value)}
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500"
                        >
                          <option value="text">Text</option>
                          <option value="video">Video</option>
                          <option value="podcast">Podcast</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => removeResource(idx)}
                          className="text-slate-500 hover:text-rose-400 transition-colors p-1 shrink-0"
                          aria-label="Remove resource"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <input
                        type="url"
                        placeholder="Resource URL"
                        value={res.url}
                        onChange={(e) => updateResource(idx, "url", e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500 placeholder:text-slate-600"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              id="edit_step_manual_submit_btn"
              type="submit"
              disabled={savingManual}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-lg shadow-blue-600/10"
            >
              {savingManual ? "Saving…" : "Save Changes"}
            </button>
          </form>
        ) : aiResult ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2">
              <p className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Here's what the agent came back with</span>
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-blue-300 uppercase bg-blue-500/15 border border-blue-500/20 px-2 py-0.5 rounded capitalize">
                    {aiResult.type}
                  </span>
                  <p className="text-sm font-bold text-white">
                    {aiResult.materialTitle || aiResult.title}
                  </p>
                </div>
                {aiResult.description && (
                  <p className="text-xs text-slate-400">{aiResult.description}</p>
                )}
                {aiResult.materialUrl ? (
                  <a
                    href={aiResult.materialUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 break-all"
                  >
                    <span>{aiResult.materialUrl}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <p className="text-xs text-slate-500">No material link came back.</p>
                )}
              </div>
            </div>

            <p className="text-[10px] text-slate-500">
              Open the link above to confirm it's actually right before trusting it — AI-suggested
              links aren't verified to be live. If it's still wrong, try again with a more specific
              instruction (e.g. name the exact source you want).
            </p>

            <div className="flex gap-2">
              <button
                id="edit_step_ai_try_again_btn"
                type="button"
                onClick={() => setAiResult(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Try Again</span>
              </button>
              <button
                id="edit_step_ai_done_btn"
                type="button"
                onClick={closeViaHistoryBack}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleAiSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                What's wrong with this step?
              </label>
              <textarea
                id="edit_step_ai_instruction_textarea"
                placeholder="e.g. The video link is dead — find a real YouTube video that actually covers this"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500 placeholder:text-slate-600 resize-none"
              />
              <p className="text-[10px] text-slate-500 mt-1.5">
                Leave blank to have the agent re-source the material link on its own.
              </p>
            </div>

            <button
              id="edit_step_ai_submit_btn"
              type="submit"
              disabled={isGenerating}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-lg shadow-blue-600/10 flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Fixing step…</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Fix With AI</span>
                </>
              )}
            </button>

            {generationError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-lg text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">AI Fix Failed</p>
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
