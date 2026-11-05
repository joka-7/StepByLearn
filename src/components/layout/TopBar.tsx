import { Trash } from "lucide-react";
import type { LearningPath } from "../../domain/types";
import type { CloudSyncState } from "../../hooks/useCloudSync";

interface Props {
  paths: LearningPath[];
  selectedPathId: string | null;
  onSelect: (id: string) => void;
  selectedPath: LearningPath | null;
  onDelete: () => void;
  sync: CloudSyncState;
}

interface SyncBadge {
  label: string;
  dotClass: string;
  title?: string;
}

function syncBadge(sync: CloudSyncState): SyncBadge {
  switch (sync.kind) {
    case "unavailable":
      return { label: "Local-only", dotClass: "bg-emerald-400" };
    case "signed-out":
      return sync.needsReconnect
        ? {
            label: "Not connected",
            dotClass: "bg-amber-400",
            title: "Reconnect Google Drive to keep syncing.",
          }
        : { label: "Local-only", dotClass: "bg-emerald-400" };
    case "checking":
      return { label: "Connecting…", dotClass: "bg-slate-400 animate-pulse" };
    case "account-conflict":
      return { label: "Sync paused", dotClass: "bg-amber-400" };
    case "active":
      switch (sync.status.state) {
        case "syncing":
          return { label: "Syncing…", dotClass: "bg-blue-400 animate-pulse" };
        case "synced":
          return { label: "Synced", dotClass: "bg-blue-400" };
        case "offline":
          return {
            label: "Offline",
            dotClass: "bg-amber-400",
            title: "Changes will sync when you're back online.",
          };
        case "error":
          return { label: "Sync error", dotClass: "bg-rose-400", title: sync.status.message };
      }
  }
}

/** Top status bar: course selector and delete action for the active course. */
export function TopBar({ paths, selectedPathId, onSelect, selectedPath, onDelete, sync }: Props) {
  const badge = syncBadge(sync);
  return (
    <header className="h-14 bg-slate-900/60 backdrop-blur border-b border-slate-800 flex items-center justify-between gap-3 px-4 sm:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <label
          htmlFor="header_course_selector"
          className="hidden sm:inline text-sm font-semibold text-slate-300 shrink-0"
        >
          Active course:
        </label>
        <select
          id="header_course_selector"
          aria-label="Active course"
          value={selectedPathId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          className="min-w-0 max-w-full bg-slate-800 text-sm border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 outline-none focus:border-blue-500"
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

      <div className="flex items-center gap-3 shrink-0">
        {selectedPath && (
          <button
            id="header_delete_course_btn"
            onClick={onDelete}
            className="text-slate-300 hover:text-rose-400 transition-colors p-1.5 hover:bg-rose-500/10 rounded-lg text-sm flex items-center gap-1.5"
            aria-label="Delete current course"
            title="Delete current course"
          >
            <Trash className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Delete Course</span>
          </button>
        )}
        <div
          role="status"
          title={badge.title}
          className="text-xs bg-slate-800/80 border border-slate-700/60 px-3 py-1 rounded-full text-slate-300 font-mono flex items-center gap-2"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${badge.dotClass}`} aria-hidden></span>
          {badge.label}
        </div>
      </div>
    </header>
  );
}
