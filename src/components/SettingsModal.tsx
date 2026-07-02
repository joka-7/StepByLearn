import { useEffect, useState } from "react";
import {
  getApiKey,
  getSettings,
  saveSettings,
  setApiKey,
} from "../repositories/settingsRepository";

interface Props {
  onClose: () => void;
  /** Notifies the parent so it can refresh the "key set" badge. */
  onSaved: () => void;
}

/** Modal to enter the Anthropic API key and choose the model. */
export function SettingsModal({ onClose, onSaved }: Props) {
  const [apiKey, setApiKeyValue] = useState("");
  const [model, setModel] = useState("claude-opus-4-8");

  useEffect(() => {
    setApiKeyValue(getApiKey() ?? "");
    getSettings().then((s) => setModel(s.cloudModel));
  }, []);

  async function save() {
    setApiKey(apiKey.trim());
    await saveSettings({ id: "singleton", cloudModel: model.trim() || "claude-opus-4-8" });
    onSaved();
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <p>
          Your Anthropic API key is stored only in this browser (localStorage) and
          is sent directly to the Anthropic API — never to any StepByLearn server,
          because there isn't one.
        </p>
        <label>
          Anthropic API key
          <input
            type="password"
            value={apiKey}
            placeholder="sk-ant-…"
            onChange={(e) => setApiKeyValue(e.target.value)}
          />
        </label>
        <label>
          Model
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </label>
        <button className="primary" onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}
