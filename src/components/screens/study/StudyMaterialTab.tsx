import { Clock, ExternalLink, FileText, Info, Video, Volume2 } from "lucide-react";
import type { ReactElement } from "react";
import type { ContentType, PathStep } from "../../../domain/types";

interface Props {
  step: PathStep;
}

const TYPE_META: Record<ContentType, { icon: ReactElement; label: string }> = {
  video: { icon: <Video className="h-3.5 w-3.5" />, label: "Watch the video" },
  podcast: { icon: <Volume2 className="h-3.5 w-3.5" />, label: "Listen to the podcast" },
  text: { icon: <FileText className="h-3.5 w-3.5" />, label: "Read the article" },
};

/**
 * The step's study material: a link to real content on the web, matching the
 * step's format, plus any supplementary resource links. Nothing here is
 * generated or hosted in-app — it's just curated pointers to external material.
 */
export function StudyMaterialTab({ step }: Props) {
  const meta = TYPE_META[step.type];

  return (
    <div className="space-y-6" id="desk_material_tab">
      {step.materialUrl ? (
        <a
          href={step.materialUrl}
          target="_blank"
          rel="noreferrer"
          className="block p-5 bg-gradient-to-br from-blue-950/40 to-slate-950 rounded-2xl border border-blue-500/20 hover:border-blue-500/40 transition-all group"
        >
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-blue-400 font-mono mb-2">
            {meta.icon}
            <span>Primary Material</span>
          </div>
          <p className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors">
            {step.materialTitle || step.title}
          </p>
          <p className="text-xs text-slate-500 mt-1 truncate font-mono">{step.materialUrl}</p>
          <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400">
            <span>{meta.label}</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </div>
        </a>
      ) : (
        <div className="text-center py-10 bg-slate-950 rounded-xl border border-slate-800">
          <Info className="h-8 w-8 text-slate-700 mx-auto mb-2" />
          <p className="text-xs text-slate-400">No material link set for this step yet.</p>
        </div>
      )}

      <div className="space-y-3">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
          Additional Resources
        </h4>

        {step.resources.length === 0 ? (
          <div className="text-center py-8 bg-slate-950 rounded-xl border border-slate-800">
            <p className="text-xs text-slate-500">No supplementary resources listed.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {step.resources.map((res, idx) => {
              const cardClass = `p-4 border rounded-xl space-y-3 block transition-all ${
                res.url
                  ? "bg-slate-950 border-slate-800 hover:border-slate-700"
                  : "bg-slate-950/60 border-slate-900"
              }`;
              const inner = (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-blue-400 uppercase bg-blue-500/15 border border-blue-500/20 px-2 py-0.5 rounded capitalize">
                      {res.type}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {res.duration}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      {res.title}
                      {res.url && <ExternalLink className="h-3 w-3 text-slate-500 shrink-0" />}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">{res.description}</p>
                  </div>
                </>
              );
              return res.url ? (
                <a key={idx} href={res.url} target="_blank" rel="noreferrer" className={cardClass}>
                  {inner}
                </a>
              ) : (
                <div key={idx} className={cardClass}>
                  {inner}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
