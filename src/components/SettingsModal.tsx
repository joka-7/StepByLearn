import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { PROVIDERS, PROVIDER_IDS, defaultModels, type ProviderId } from "../domain/providers";
import type { AppSettings } from "../domain/types";
import {
  getApiKey,
  getSettings,
  saveSettings,
  setApiKey,
} from "../repositories/settingsRepository";

interface Props {
  onClose: () => void;
  /** Notifies the parent so it can refresh the provider/key badge. */
  onSaved: () => void;
}

/** Modal to choose the AI provider and enter its API key and model. */
export function SettingsModal({ onClose, onSaved }: Props) {
  const [provider, setProvider] = useState<ProviderId>("anthropic");
  const [models, setModels] = useState<Record<ProviderId, string>>(defaultModels());
  const [apiKey, setApiKeyValue] = useState("");

  // Load persisted settings; the key field always reflects the selected provider.
  useEffect(() => {
    getSettings().then((s) => {
      setProvider(s.provider);
      setModels(s.models);
      setApiKeyValue(getApiKey(s.provider) ?? "");
    });
  }, []);

  function switchProvider(next: ProviderId) {
    setProvider(next);
    setApiKeyValue(getApiKey(next) ?? "");
  }

  async function save() {
    // Store the key for the *selected* provider only; other keys are untouched.
    setApiKey(provider, apiKey.trim());
    const next: AppSettings = {
      id: "singleton",
      provider,
      models: {
        ...models,
        [provider]: (models[provider] ?? "").trim() || info.defaultModel,
      },
    };
    await saveSettings(next);
    onSaved();
    onClose();
  }

  // Defensive fallback: if `provider` is ever something other than a known id
  // (a stale cache, a future migration bug, a corrupted record), fall back to
  // Anthropic's info rather than crashing the whole modal on `undefined.label`.
  const info = PROVIDERS[provider] ?? PROVIDERS.anthropic;

  return (
    <div
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Choose a provider and paste its API key. Keys are stored only in this browser
          (localStorage) and sent directly to the provider's API — never to any StepByLearn server,
          because there isn't one.
        </p>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">Provider</label>
          <select
            value={provider}
            onChange={(e) => switchProvider(e.target.value as ProviderId)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
          >
            {PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>
                {PROVIDERS[id].label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            {info.label} API key
          </label>
          <input
            type="password"
            value={apiKey}
            placeholder={info.keyPlaceholder}
            onChange={(e) => setApiKeyValue(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500 placeholder:text-slate-600"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Model — freely editable; type any model id this provider supports
          </label>
          <input
            type="text"
            value={models[provider] ?? info.defaultModel}
            onChange={(e) => setModels({ ...models, [provider]: e.target.value })}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
          />
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          Providers rename and retire models over time. If generation fails with a "model not found"
          error, check{" "}
          <a
            href={info.modelsUrl}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
          >
            {info.label}'s current model list
          </a>{" "}
          and paste a valid id above.
        </p>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          Get a key:{" "}
          <a
            href={info.consoleUrl}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
          >
            {info.consoleUrl.replace(/^https:\/\//, "")}
          </a>
        </p>

        <button
          onClick={save}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-lg shadow-indigo-600/10"
        >
          Save
        </button>
      </div>
    </div>
  );
}
