import type { LearningPath } from "../domain/types";
import { schedulePath } from "../services/calendar";
import { setStepStatus, summarize } from "../services/progress";
import { deletePath } from "../repositories/pathRepository";

interface Props {
  path: LearningPath;
  onDeleted: () => void;
}

/** The right-hand detail view: progress, steps, scheduling, deletion. */
export function PathDetail({ path, onDeleted }: Props) {
  const progress = summarize(path);

  async function toggleStep(stepId: string, done: boolean) {
    await setStepStatus(path.id, stepId, done ? "done" : "not_started");
  }

  async function schedule() {
    const today = new Date().toISOString().slice(0, 10);
    await schedulePath(path, {
      startDate: today,
      daysBetween: 2,
      skipWeekends: true,
      milestoneEvery: 3,
    });
  }

  async function remove() {
    if (!confirm(`Delete "${path.title}"? This cannot be undone.`)) return;
    await deletePath(path.id);
    onDeleted();
  }

  return (
    <section className="card">
      <h2 className="detail-title">{path.title}</h2>
      <div className="detail-meta">
        <span className="chip">{path.difficulty}</span>
        <span className="chip">topic: {path.topic}</span>
        {path.estimatedHours ? (
          <span className="chip">~{path.estimatedHours}h</span>
        ) : null}
        <span className="chip">via {path.modelName}</span>
        {progress.streakDays ? (
          <span className="chip">🔥 {progress.streakDays}-day streak</span>
        ) : null}
      </div>

      <div className="progress-wrap">
        <div className="progress-label">
          <span>Progress</span>
          <span>
            {progress.doneSteps}/{progress.totalSteps} · {progress.percentComplete}%
          </span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${progress.percentComplete}%` }}
          />
        </div>
      </div>

      <div className="section-row">
        <h3>Steps</h3>
        <div className="actions">
          <button className="ghost" onClick={schedule}>
            Schedule from today
          </button>
          <button className="ghost danger" onClick={remove}>
            Delete
          </button>
        </div>
      </div>

      <ul className="steps">
        {path.steps.map((step, i) => {
          const done = step.status === "done";
          return (
            <li key={step.id} className={`step${done ? " done" : ""}`}>
              <input
                type="checkbox"
                className="step-check"
                checked={done}
                onChange={(e) => toggleStep(step.id, e.target.checked)}
              />
              <span className="step-index">{i + 1}</span>
              <div className="step-body">
                <div className="step-title">{step.title}</div>
                {step.content ? (
                  <div className="step-content">{step.content}</div>
                ) : null}
                {step.scheduledDate ? (
                  <div className="step-date">
                    📅 {step.scheduledDate}
                    {step.isMilestone ? (
                      <span className="milestone">★ milestone</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
