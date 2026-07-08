import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { SettingsModal } from "./components/SettingsModal";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { AnalyticsView } from "./components/screens/AnalyticsView";
import { CalendarView } from "./components/screens/CalendarView";
import { DashboardView } from "./components/screens/DashboardView";
import { ManualBuilderView } from "./components/screens/ManualBuilderView";
import { StudyView } from "./components/screens/StudyView";
import type { ViewId } from "./components/viewTypes";
import { PROVIDERS } from "./domain/providers";
import type { LearningPath } from "./domain/types";
import { startPathSync } from "./firebase/pathSync";
import { useAuthUser } from "./hooks/useAuthUser";
import { deletePath, listPaths } from "./repositories/pathRepository";
import { getSettings, hasApiKey } from "./repositories/settingsRepository";

/**
 * Root component. Wires the reactive path list (via Dexie live queries) to the
 * sidebar navigation and the 5 workspace views. All state lives in IndexedDB;
 * the only network calls are user-initiated AI generation requests.
 */
export function App() {
  // useLiveQuery re-runs automatically whenever the paths table changes, so any
  // service mutation (generate, schedule, mark-done, delete) refreshes the UI.
  const paths = useLiveQuery(() => listPaths(), [], []);
  const settings = useLiveQuery(() => getSettings(), []);
  const { user } = useAuthUser();

  // Mirror Dexie <-> this user's Firestore paths while signed in; stop on
  // sign-out. No-ops entirely if Firebase isn't configured for this deploy.
  useEffect(() => {
    if (!user) return;
    return startPathSync(user.uid);
  }, [user]);

  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // Bumped on save so the key badge re-reads localStorage (which isn't reactive).
  const [keyTick, setKeyTick] = useState(0);

  // Derive the effective selection from `paths` directly (rather than syncing
  // it into state via an effect): defaults to the newest path, and falls back
  // automatically the moment the previously-selected path/step disappears
  // (deleted locally or elsewhere via sync).
  const effectiveSelectedPathId =
    selectedPathId && paths.some((p) => p.id === selectedPathId)
      ? selectedPathId
      : (paths[0]?.id ?? null);
  const selectedPath = paths.find((p) => p.id === effectiveSelectedPathId) ?? null;

  const effectiveSelectedStepId =
    selectedPath && selectedPath.steps.some((s) => s.id === selectedStepId)
      ? selectedStepId
      : (selectedPath?.steps[0]?.id ?? null);

  const provider = settings?.provider ?? "anthropic";
  // keyTick is referenced so this recomputes after a save.
  void keyTick;
  const keyPresent = hasApiKey(provider);

  function selectPath(id: string) {
    setSelectedPathId(id);
  }

  function handleCreated(path: LearningPath) {
    setSelectedPathId(path.id);
    setSelectedStepId(path.steps[0]?.id ?? null);
    setActiveView("study");
  }

  async function handleDeleteSelected() {
    if (!selectedPath) return;
    if (!confirm(`Delete "${selectedPath.title}"? This cannot be undone.`)) return;
    await deletePath(selectedPath.id);
    setSelectedPathId(null);
  }

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col md:flex-row"
      id="app_root"
    >
      <Sidebar
        activeView={activeView}
        onChangeView={setActiveView}
        activePath={selectedPath}
        onOpenSettings={() => setShowSettings(true)}
        keyPresent={keyPresent}
        providerLabel={(PROVIDERS[provider] ?? PROVIDERS.anthropic).label}
        user={user}
      />

      <main className="flex-1 flex flex-col min-w-0" id="main_content_stage">
        <TopBar
          paths={paths}
          selectedPathId={effectiveSelectedPathId}
          onSelect={selectPath}
          selectedPath={selectedPath}
          onDelete={handleDeleteSelected}
          synced={Boolean(user)}
        />

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8" id="stage_inner_scroll">
          {activeView === "dashboard" && (
            <DashboardView
              paths={paths}
              hasKey={keyPresent}
              onNeedKey={() => setShowSettings(true)}
              onGenerated={handleCreated}
              onSelectPath={selectPath}
              onOpenStudyDesk={() => setActiveView("study")}
              selectedPathId={effectiveSelectedPathId}
            />
          )}

          {activeView === "study" &&
            (selectedPath ? (
              <StudyView
                path={selectedPath}
                selectedStepId={effectiveSelectedStepId}
                onSelectStep={setSelectedStepId}
                onGoToPlanner={() => setActiveView("dashboard")}
              />
            ) : (
              <StudyViewEmptyState onGoToPlanner={() => setActiveView("dashboard")} />
            ))}

          {activeView === "calendar" && <CalendarView paths={paths} />}

          {activeView === "manual" && <ManualBuilderView onCreated={handleCreated} />}

          {activeView === "analytics" && <AnalyticsView paths={paths} />}
        </div>
      </main>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={() => setKeyTick((t) => t + 1)}
        />
      )}
    </div>
  );
}

/** Shown when the Study Desk nav item is reached with no path selected. */
function StudyViewEmptyState({ onGoToPlanner }: { onGoToPlanner: () => void }) {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl text-center py-20">
        <h3 className="font-bold text-sm text-slate-300">No Course Selected</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-2">
          Select an existing course or create a new AI-generated or manual roadmap to launch your
          workspace.
        </p>
        <button
          onClick={onGoToPlanner}
          className="mt-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors"
        >
          Go to Planner
        </button>
      </div>
    </div>
  );
}
