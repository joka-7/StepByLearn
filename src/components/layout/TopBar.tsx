import { Trash } from "lucide-react";
import type { LearningPath } from "../../domain/types";

interface Props {
  paths: LearningPath[];
  selectedPathId: string | null;
  onSelect: (id: string) => void;
  selectedPath: LearningPath | null;
  onDelete: () => void;
  /** Whether courses are syncing to a signed-in Google account right now. */
  synced: boolean;
}

/** Top status bar: course selector and delete action for the active course. */
export function TopBar({ paths, selectedPathId, onSelect, selectedPath, onDelete, synced }: Props) {
  return (
    <header className="h-14 bg-slate-900/60 backdrop-blur border-b border-slate-800 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-300">Active Course Workspace:</span>
        <select
          id="header_course_selector"
          value={selectedPathId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          className="bg-slate-800 text-xs border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 outline-none focus:border-indigo-500"
        >
          {paths.length === 0 ? (
            <option value="">No Courses Yet</option>
          ) : (
            paths.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="flex items-center gap-4">
        {selectedPath && (
          <button
            id="header_delete_course_btn"
            onClick={onDelete}
            className="text-slate-400 hover:text-rose-400 transition-colors p-1.5 hover:bg-rose-500/10 rounded-lg text-xs flex items-center gap-1.5"
            title="Delete Current Course"
          >
            <Trash className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Delete Course</span>
          </button>
        )}
        <div className="text-xs bg-slate-800/80 border border-slate-700/60 px-3 py-1 rounded-full text-slate-400 font-mono flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${synced ? "bg-indigo-400" : "bg-emerald-400"}`}
          ></span>
          {synced ? "Synced" : "Local-only"}
        </div>
      </div>
    </header>
  );
}
