import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import type { ContentType, LearningPath } from "../../domain/types";
import { createManualPath, type ManualStepInput } from "../../services/manualBuilder";

interface Props {
  onCreated: (path: LearningPath) => void;
}

const EMPTY_STEP: ManualStepInput = {
  title: "Introduction & Setup",
  duration: "30 minutes",
  type: "text",
  description: "Getting acquainted with the core concepts and launching our workspace.",
  materialUrl: "",
};

/** Offline course builder — no AI, no API key required. */
export function ManualBuilderView({ onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [stepDuration, setStepDuration] = useState("30 minutes");
  const [steps, setSteps] = useState<ManualStepInput[]>([EMPTY_STEP]);

  function addStep() {
    setSteps((prev) => [
      ...prev,
      { title: "", duration: "30 minutes", type: "text", description: "", materialUrl: "" },
    ]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function updateStep(index: number, field: keyof ManualStepInput, value: string) {
    setSteps((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !topic.trim()) return;

    const path = await createManualPath({ title, topic, stepDuration, steps });

    setTitle("");
    setTopic("");
    setSteps([EMPTY_STEP]);
    onCreated(path);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl mx-auto"
      id="view_manual"
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-white">Course Basics</h2>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Course Title
              </label>
              <input
                id="manual_form_title_input"
                type="text"
                required
                placeholder="e.g. Master React 19 Fundamentals"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500 placeholder:text-slate-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                General Topic Area
              </label>
              <input
                id="manual_form_topic_input"
                type="text"
                required
                placeholder="e.g. React hooks, State managers"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-blue-500 placeholder:text-slate-600"
              />
            </div>
          </div>

          <div className="hidden lg:block pt-4 select-none">
            <h3 className="text-4xl font-bold text-slate-800 leading-tight">
              Manual Architect:
              <br />
              Pro Theme
            </h3>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-white">Curriculum Structure</h2>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Expected Step Duration
              </label>
              <select
                id="manual_form_duration_select"
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

            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider font-mono pt-2">
              Curriculum Milestones
            </label>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {steps.map((step, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-slate-950 rounded-xl border border-slate-800 relative space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-slate-200">
                      <GripVertical className="h-4 w-4 text-slate-600" />
                      Step {idx + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500 p-1">
                        <Pencil className="h-3.5 w-3.5" />
                      </span>
                      {steps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeStep(idx)}
                          className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Step Title
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Step title (e.g. Setting up Vite & TS compiler)"
                        value={step.title}
                        onChange={(e) => updateStep(idx, "title", e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Content Type
                      </label>
                      <select
                        value={step.type}
                        onChange={(e) => updateStep(idx, "type", e.target.value as ContentType)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-blue-500"
                      >
                        <option value="text">Text Tutorial</option>
                        <option value="video">Video Study</option>
                        <option value="podcast">Podcast Audio</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      placeholder="Brief description / instructions (e.g. Initialize package.json, edit configs, install React...)"
                      value={step.description}
                      onChange={(e) => updateStep(idx, "description", e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500"
                    />
                  </div>

                  <input
                    type="url"
                    placeholder="Material URL — a real link to the video/podcast/article for this step (optional)"
                    value={step.materialUrl}
                    onChange={(e) => updateStep(idx, "materialUrl", e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500"
                  />
                </div>
              ))}
            </div>

            <button
              id="manual_form_add_step_btn"
              type="button"
              onClick={addStep}
              className="w-full text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-semibold px-3 py-2.5 rounded-xl border border-blue-500/20 flex items-center justify-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Study Step</span>
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-white">Finalize Course</h2>
            <button
              id="manual_form_submit_btn"
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl text-xs transition-colors shadow-lg flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" />
              <span>Construct and Load Offline Course</span>
            </button>
          </div>
        </div>
      </form>
    </motion.div>
  );
}
