import { Globe, Settings, X } from "lucide-react";
import { useState } from "react";
import { ModelPicker } from "modeldispatcher-react-ui";
import "modeldispatcher-react-ui/styles.css";
import {
  loadExternalChatFavorite,
  saveExternalChatFavorite,
  type AgentConfig,
  type ExternalChatProviderId,
} from "modeldispatcher-browser-agent";
import { GithubIcon } from "./GithubIcon";
import { closeViaHistoryBack, useBackClose } from "../hooks/useBackClose";
import { loadAgentConfig, saveConfig } from "../repositories/settingsRepository";

interface Props {
  onClose: () => void;
  /** Notifies the parent so it can refresh the provider/key badge. Called on
   * every change — ModelPicker live-saves, matching its own convention. */
  onSaved: () => void;
}

/** Modal to configure the AI provider fallback list via the shared
 * `<ModelPicker>` — add one or more providers, each with a model and pooled
 * keys, plus saving a favorite free AI app. */
export function SettingsModal({ onClose, onSaved }: Props) {
  useBackClose(true, onClose);
  const [config, setConfig] = useState<AgentConfig>(loadAgentConfig);
  const [favorite, setFavorite] = useState<ExternalChatProviderId | null>(loadExternalChatFavorite);

  function handleConfigChange(next: AgentConfig): void {
    setConfig(next);
    saveConfig(next);
    onSaved();
  }

  function handleFavoriteChange(next: ExternalChatProviderId | null): void {
    setFavorite(next);
    saveExternalChatFavorite(next);
  }

  return (
    <div
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={closeViaHistoryBack}
    >
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Settings className="h-4 w-4" /> Settings
          </h2>
          <button
            onClick={closeViaHistoryBack}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Choose one or more providers, each with its own model and pooled API keys — they're tried
          in order, with automatic fallback if one runs out or fails. Keys are stored only in this
          browser (localStorage) and sent directly to the provider's API — never to any StepByLearn
          server, because there isn't one.
        </p>

        <ModelPicker
          config={config}
          onConfigChange={handleConfigChange}
          externalChatFavorite={favorite}
          onExternalChatFavoriteChange={handleFavoriteChange}
        />

        <div className="flex items-center justify-center gap-4 pt-1 border-t border-slate-800">
          <a
            href="https://github.com/joka-7"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <GithubIcon size={16} />
          </a>
          <a
            href="https://jk-dev-7.vercel.app"
            target="_blank"
            rel="noreferrer"
            aria-label="jk.dev portfolio"
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <Globe size={16} />
          </a>
        </div>
      </div>
    </div>
  );
}
