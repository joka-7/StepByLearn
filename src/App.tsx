import { useLiveQuery } from "dexie-react-hooks";
import { Globe, Menu } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { PROVIDERS, type AgentConfig } from "modeldispatcher-browser-agent";
import { SettingsModal } from "./components/SettingsModal";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { DashboardView } from "./components/screens/DashboardView";
import { ConfirmDialog } from "./components/ui/ConfirmDialog";
import { useToast } from "./components/ui/toast";
import type { ViewId } from "./components/viewTypes";
import type { LearningPath } from "./domain/types";
import { useAuthUser } from "./hooks/useAuthUser";
import { useBackClose } from "./hooks/useBackClose";
import { useCloudSync } from "./hooks/useCloudSync";
import { DriveSyncError } from "./sync/driveDocument";
import { formatSignInError } from "./sync/driveSync";
import {
  deletePath,
  listPaths,
  purgeExpiredTombstones,
  restorePath,
} from "./repositories/pathRepository";
import {
  isConfigReady,
  loadAgentConfig,
  migrateLegacySettings,
} from "./repositories/settingsRepository";

// The default view loads eagerly; the rest are split out of the first bundle.
const StudyView = lazy(() =>
  import("./components/screens/StudyView").then((m) => ({ default: m.StudyView })),
);
const CalendarView = lazy(() =>
  import("./components/screens/CalendarView").then((m) => ({ default: m.CalendarView })),
);
const ManualBuilderView = lazy(() =>
  import("./components/screens/ManualBuilderView").then((m) => ({
    default: m.ManualBuilderView,
  })),
);
const AnalyticsView = lazy(() =>
  import("./components/screens/AnalyticsView").then((m) => ({ default: m.AnalyticsView })),
);

const VIEW_LABELS: Record<ViewId, string> = {
  dashboard: "Workspace Planner",
  study: "Active Study Desk",
  calendar: "Study Calendar",
  manual: "Manual Course Architect",
  analytics: "My Analytics",
};

function isOverlayHistoryEntry(state: unknown): boolean {
  return typeof state === "object" && state !== null && "overlay" in state;
}

/**
 * Root component. Wires the reactive path list (via Dexie live queries) to the
 * sidebar navigation and the 5 workspace views. Course data lives in
 * IndexedDB; the AI provider config lives in
 * modeldispatcher-browser-agent's own localStorage blob instead (shared with
 * every other app that adopts it). Network calls are user-initiated AI
 * generation requests and, when connected, sync with the user's own Google Drive.
 */
export function App() {
  // useLiveQuery re-runs automatically whenever the paths table changes, so any
  // service mutation (generate, schedule, mark-done, delete) refreshes the UI.
  const paths = useLiveQuery(() => listPaths(), [], []);
  const { user } = useAuthUser();
  const cloudSync = useCloudSync(user);
  const showToast = useToast();

  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // Provider config lives in modeldispatcher-browser-agent's localStorage
  // blob, which isn't reactive — re-read explicitly on every save.
  const [config, setConfig] = useState<AgentConfig>(loadAgentConfig);

  useEffect(() => {
    // One-time migration from the pre-0.6.7 Dexie-backed single-provider
    // settings, then pick up whatever it produced (a no-op once already run).
    migrateLegacySettings().then(
      () => setConfig(loadAgentConfig()),
      () => showToast({ tone: "error", message: "Couldn't migrate your old provider settings." }),
    );
    void purgeExpiredTombstones();
    // Ask the browser not to evict IndexedDB under storage pressure (Safari
    // otherwise clears it after 7 days without a visit for non-installed sites).
    void navigator.storage?.persist?.();
  }, [showToast]);

  // Mobile only: the sidebar renders as a slide-in drawer there (see Sidebar's
  // md:static/fixed classes) instead of stacking above the content, so picking
  // a tab replaces the whole screen rather than just scrolling to it. The
  // hardware/browser back button closes the drawer first, same as a modal.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useBackClose(mobileNavOpen, () => setMobileNavOpen(false));

  // Push a browser history entry per tab switch so the hardware/browser back
  // button steps back through the app's own tabs — like a native app's back
  // stack — instead of immediately exiting.
  useEffect(() => {
    window.history.replaceState({ view: "dashboard" }, "");
    function handlePopState(event: PopStateEvent) {
      const view = (event.state as { view?: ViewId } | null)?.view;
      if (view) setActiveView(view);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigateToView(next: ViewId) {
    // Picking a tab from the mobile drawer: reuse the drawer's history entry
    // instead of stacking a new one on top of it, so no dead Back press is left.
    if (isOverlayHistoryEntry(window.history.state)) {
      window.history.replaceState({ view: next }, "");
    } else if (next !== activeView) {
      window.history.pushState({ view: next }, "");
    }
    setActiveView(next);
  }

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

  const keyPresent = isConfigReady(config);
  // Display only, for the sidebar badge — with more than one provider
  // configured, which one actually answers a request depends on runtime
  // fallback, not this.
  const providerLabel = PROVIDERS[config.providers[0]?.provider ?? "anthropic"].name;

  function handleCreated(path: LearningPath) {
    setSelectedPathId(path.id);
    setSelectedStepId(path.steps[0]?.id ?? null);
    navigateToView("study");
  }

  async function handleDeleteSelected() {
    if (!selectedPath) return;
    const { id, title } = selectedPath;
    await deletePath(id);
    setSelectedPathId(null);
    showToast({
      message: `Deleted "${title}".`,
      action: { label: "Undo", onClick: () => void restorePath(id) },
    });
  }

  // Not async-awaited before signIn: Google's popup must open inside the click.
  function handleSignIn() {
    cloudSync.signIn().catch((err: unknown) => {
      showToast({ tone: "error", message: formatSignInError(err) });
    });
  }

  async function handleSignOut() {
    try {
      await cloudSync.signOut();
    } catch {
      showToast({ tone: "error", message: "Couldn't sign out. Try again." });
    }
  }

  async function handleDeleteSyncedData() {
    try {
      await cloudSync.deleteSyncedData();
      showToast({
        message:
          "Your synced data was deleted from Google Drive. Courses on this device were kept.",
      });
    } catch (err) {
      showToast({
        tone: "error",
        message:
          err instanceof DriveSyncError && err.code === "offline"
            ? "You're offline. Nothing was deleted; try again when you're back online."
            : "Couldn't delete your synced data. Nothing was changed; try again.",
      });
    }
  }

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col md:flex-row"
      id="app_root"
    >
      <header className="md:hidden h-14 shrink-0 bg-slate-900 border-b border-slate-800 flex items-center gap-3 px-4">
        <button
          id="mobile_nav_open_btn"
          onClick={() => setMobileNavOpen(true)}
          className="text-slate-300 hover:text-white transition-colors p-1 -ml-1"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-bold text-white">{VIEW_LABELS[activeView]}</span>
      </header>

      <Sidebar
        activeView={activeView}
        onChangeView={navigateToView}
        activePath={selectedPath}
        onOpenSettings={() => setShowSettings(true)}
        keyPresent={keyPresent}
        providerLabel={providerLabel}
        user={user}
        cloud={cloudSync.state}
        onSignIn={handleSignIn}
        onSignOut={() => void handleSignOut()}
        onDeleteSyncedData={() => void handleDeleteSyncedData()}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <main className="flex-1 flex flex-col min-w-0" id="main_content_stage">
        <TopBar
          paths={paths}
          selectedPathId={effectiveSelectedPathId}
          onSelect={setSelectedPathId}
          selectedPath={selectedPath}
          onDelete={handleDeleteSelected}
          sync={cloudSync.state}
        />

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8" id="stage_inner_scroll">
          <Suspense fallback={<p className="text-sm text-slate-400">Loading…</p>}>
            {activeView === "dashboard" && (
              <DashboardView
                paths={paths}
                hasKey={keyPresent}
                onNeedKey={() => setShowSettings(true)}
                onGenerated={handleCreated}
                onSelectPath={setSelectedPathId}
                onOpenStudyDesk={() => navigateToView("study")}
                selectedPathId={effectiveSelectedPathId}
              />
            )}

            {activeView === "study" &&
              (selectedPath ? (
                <StudyView
                  path={selectedPath}
                  selectedStepId={effectiveSelectedStepId}
                  onSelectStep={setSelectedStepId}
                  onGoToPlanner={() => navigateToView("dashboard")}
                  hasKey={keyPresent}
                  onNeedKey={() => setShowSettings(true)}
                />
              ) : (
                <StudyViewEmptyState onGoToPlanner={() => navigateToView("dashboard")} />
              ))}

            {activeView === "calendar" && <CalendarView paths={paths} />}

            {activeView === "manual" && <ManualBuilderView onCreated={handleCreated} />}

            {activeView === "analytics" && <AnalyticsView paths={paths} />}
          </Suspense>

          <div className="flex items-center justify-center gap-1.5 pt-8 pb-2">
            <span className="text-xs text-slate-400">Built by joka-7</span>
            <a
              href="https://jk-dev-7.vercel.app"
              target="_blank"
              rel="noreferrer"
              aria-label="jk.dev portfolio"
              title="jk.dev portfolio"
              className="tap-fx text-slate-400 hover:text-slate-200"
            >
              <Globe size={14} aria-hidden />
            </a>
          </div>
        </div>
      </main>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={() => setConfig(loadAgentConfig())}
        />
      )}

      {cloudSync.state.kind === "account-conflict" && (
        <ConfirmDialog
          title="Courses from another account"
          confirmLabel="Remove them and continue"
          cancelLabel="Sign out"
          danger
          onConfirm={() => void cloudSync.replaceLocalData()}
          onCancel={() => void cloudSync.cancelSignIn()}
        >
          This device has courses that were synced with a different Google account. To keep the two
          accounts separate, remove them from this device before loading yours. They stay safe in
          the other account&apos;s cloud copy.
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Shown when the Study Desk nav item is reached with no path selected. */
function StudyViewEmptyState({ onGoToPlanner }: { onGoToPlanner: () => void }) {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl text-center py-20">
        <h3 className="font-bold text-sm text-slate-200">No Course Selected</h3>
        <p className="text-sm text-slate-400 max-w-sm mx-auto mt-2">
          Select an existing course or create a new AI-generated or manual roadmap to launch your
          workspace.
        </p>
        <button
          onClick={onGoToPlanner}
          className="mt-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-xl text-sm transition-colors"
        >
          Go to Planner
        </button>
      </div>
    </div>
  );
}
