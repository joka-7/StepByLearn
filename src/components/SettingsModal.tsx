import { useEffect, useState } from "react";
import {
  PROVIDERS,
  PROVIDER_IDS,
  defaultModels,
  type ProviderId,
} from "../domain/providers";
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
        [provider]: models[provider].trim() || PROVIDERS[provider].defaultModel,
      },
    };
    await saveSettings(next);
    onSaved();
    onClose();
  }

  const info = PROVIDERS[provider];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <p>
          Choose a provider and paste its API key. Keys are stored only in this
          browser (localStorage) and sent directly to the provider's API — never
          to any StepByLearn server, because there isn't one.
        </p>

        <label>
          Provider
          <select
            value={provider}
            onChange={(e) => switchProvider(e.target.value as ProviderId)}
          >
            {PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>
                {PROVIDERS[id].label}
              </option>
            ))}
          </select>
        </label>

        <label>
          {info.label} API key
          <input
            type="password"
            value={apiKey}
            placeholder={info.keyPlaceholder}
            onChange={(e) => setApiKeyValue(e.target.value)}
          />
        </label>

        <label>
          Model
          <input
            type="text"
            value={models[provider]}
            onChange={(e) =>
              setModels({ ...models, [provider]: e.target.value })
            }
          />
        </label>

        <p className="hint" style={{ color: "var(--muted)" }}>
          Get a key:{" "}
          <a href={info.consoleUrl} target="_blank" rel="noreferrer">
            {info.consoleUrl.replace(/^https:\/\//, "")}
          </a>
        </p>

        <button className="primary" onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}
