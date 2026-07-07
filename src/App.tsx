import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { GenerateForm } from "./components/GenerateForm";
import { PathList } from "./components/PathList";
import { PathDetail } from "./components/PathDetail";
import { SettingsModal } from "./components/SettingsModal";
import { PROVIDERS } from "./domain/providers";
import { listPaths } from "./repositories/pathRepository";
import { getSettings, hasApiKey } from "./repositories/settingsRepository";

/**
 * Root component. Wires the reactive path list (via Dexie live queries) to the
 * generate form, sidebar list, and detail view. All state lives in IndexedDB;
 * the only network call is the user-initiated generation request.
 */
export function App() {
  // useLiveQuery re-runs automatically whenever the paths table changes, so any
  // service mutation (generate, schedule, mark-done, delete) refreshes the UI.
  const paths = useLiveQuery(() => listPaths(), [], []);
  const settings = useLiveQuery(() => getSettings(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // Bumped on save so the key badge re-reads localStorage (which isn't reactive).
  const [keyTick, setKeyTick] = useState(0);

  // Default the selection to the newest path once data loads.
  useEffect(() => {
    if (selectedId === null && paths.length > 0) setSelectedId(paths[0].id);
  }, [paths, selectedId]);

  const selectedPath = paths.find((p) => p.id === selectedId) ?? null;
  const provider = settings?.provider ?? "anthropic";
  // keyTick is referenced so this recomputes after a save.
  void keyTick;
  const keyPresent = hasApiKey(provider);

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <img className="logo" src="/icon.svg" alt="StepByLearn" width={36} height={36} />
          <div>
            <h1>StepByLearn</h1>
            <p className="tagline">Offline-first, cloud-AI learning paths</p>
          </div>
        </div>
        <div className="badges">
          <span className={`badge ${keyPresent ? "badge-on" : "badge-off"}`}>
            {keyPresent ? "● " : "○ "}
            {(PROVIDERS[provider] ?? PROVIDERS.anthropic).label}
          </span>
          <button className="link-btn" onClick={() => setShowSettings(true)}>
            Settings
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="sidebar">
          <GenerateForm
            hasKey={keyPresent}
            onGenerated={setSelectedId}
            onNeedKey={() => setShowSettings(true)}
          />
          <PathList
            paths={paths}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </section>

        {selectedPath ? (
          <PathDetail path={selectedPath} onDeleted={() => setSelectedId(null)} />
        ) : (
          <section className="card">
            <p className="empty-detail">
              Select a path, or generate a new one to get started.
            </p>
          </section>
        )}
      </main>

      {showSettings ? (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={() => setKeyTick((t) => t + 1)}
        />
      ) : null}
    </>
  );
}
