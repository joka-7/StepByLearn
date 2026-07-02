import type { LearningPath } from "../domain/types";

interface Props {
  paths: LearningPath[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** The sidebar list of saved learning paths. */
export function PathList({ paths, selectedId, onSelect }: Props) {
  return (
    <div className="card">
      <h2>Your paths</h2>
      {paths.length === 0 ? (
        <p className="empty">No paths yet.</p>
      ) : (
        <ul className="path-list">
          {paths.map((path) => (
            <li
              key={path.id}
              className={`path-item${path.id === selectedId ? " active" : ""}`}
              onClick={() => onSelect(path.id)}
            >
              <div className="pi-title">{path.title}</div>
              <div className="pi-meta">
                {path.difficulty} · {path.steps.length} steps
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
