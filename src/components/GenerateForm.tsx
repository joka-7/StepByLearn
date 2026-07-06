import { useState, type FormEvent } from "react";
import { generatePath } from "../services/generation";
import type { Difficulty } from "../domain/types";

interface Props {
  /** Called with the new path's id after a successful generation. */
  onGenerated: (pathId: string) => void;
  /** Opens the settings modal when no API key is present. */
  onNeedKey: () => void;
  hasKey: boolean;
}

/** The "New path" form: topic + difficulty, calls the cloud model to generate. */
export function GenerateForm({ onGenerated, onNeedKey, hasKey }: Props) {
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!topic.trim()) return;
    if (!hasKey) {
      onNeedKey();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const path = await generatePath(topic.trim(), difficulty);
      setTopic("");
      onGenerated(path.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>New path</h2>
      <label>
        Topic
        <input
          type="text"
          value={topic}
          placeholder="e.g. Rust ownership"
          onChange={(e) => setTopic(e.target.value)}
          required
        />
      </label>
      <label>
        Difficulty
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as Difficulty)}
        >
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </label>
      <button className="primary" type="submit" disabled={busy}>
        {busy ? "Generating…" : "Generate"}
      </button>
      <p className="hint">{error}</p>
    </form>
  );
}
