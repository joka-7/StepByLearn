// StepByLearn UI — vanilla JS client over the /api JSON endpoints.
// No build step, no framework; everything works against the local server.

const api = {
  async get(path) {
    const r = await fetch(path);
    if (!r.ok) throw await toError(r);
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw await toError(r);
    return r.json();
  },
  async patch(path, body) {
    const r = await fetch(path, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw await toError(r);
    return r.json();
  },
};

async function toError(resp) {
  let detail = `HTTP ${resp.status}`;
  try {
    const data = await resp.json();
    detail = data.error || data.detail || detail;
    if (data.hints) detail += " — " + data.hints.join(" ");
  } catch (_) {}
  return new Error(detail);
}

let state = { paths: [], selectedId: null, calendar: {} };

// ---- Engine status badges ----
async function refreshEngines() {
  const el = document.getElementById("engine-status");
  try {
    const data = await api.get("/api/engines");
    const local = data.local_ollama
      ? '<span class="badge badge-on">● Local engine ready</span>'
      : '<span class="badge badge-off">○ Local engine offline</span>';
    const cloud = data.cloud_key_present
      ? '<span class="badge badge-on">● Cloud key set</span>'
      : '<span class="badge badge-off">○ No cloud key</span>';
    el.innerHTML = local + cloud;
  } catch (_) {
    el.innerHTML = '<span class="badge badge-off">API unreachable</span>';
  }
}

// ---- Paths list ----
async function refreshPaths() {
  state.paths = await api.get("/api/paths");
  const list = document.getElementById("path-list");
  if (state.paths.length === 0) {
    list.innerHTML = '<li class="empty">No paths yet.</li>';
    return;
  }
  list.innerHTML = "";
  for (const p of state.paths) {
    const li = document.createElement("li");
    li.className = "path-item" + (p.id === state.selectedId ? " active" : "");
    li.innerHTML = `
      <div class="pi-title">${escapeHtml(p.title)}</div>
      <div class="pi-meta">${p.difficulty} · ${p.steps.length} steps · ${p.generated_by}</div>`;
    li.onclick = () => selectPath(p.id);
    list.appendChild(li);
  }
}

async function selectPath(id) {
  state.selectedId = id;
  await refreshPaths();
  await renderDetail(id);
}

// ---- Detail view ----
async function renderDetail(id) {
  const detail = document.getElementById("detail");
  const path = state.paths.find((p) => p.id === id);
  if (!path) return;

  const [progress, calendar] = await Promise.all([
    api.get(`/api/paths/${id}/progress`).catch(() => null),
    api.get(`/api/paths/${id}/calendar`).catch(() => []),
  ]);
  const calByStep = {};
  for (const c of calendar) calByStep[c.step_id] = c;

  const pct = progress ? progress.percent_complete : 0;
  const streak = progress ? progress.streak_days : 0;

  detail.innerHTML = `
    <h2 class="detail-title">${escapeHtml(path.title)}</h2>
    <div class="detail-meta">
      <span class="chip">${path.difficulty}</span>
      <span class="chip">topic: ${escapeHtml(path.topic)}</span>
      ${path.estimated_hours ? `<span class="chip">~${path.estimated_hours}h</span>` : ""}
      <span class="chip">via ${path.generated_by}</span>
      ${streak ? `<span class="chip">🔥 ${streak}-day streak</span>` : ""}
    </div>

    <div class="progress-wrap">
      <div class="progress-label">
        <span>Progress</span>
        <span>${progress ? progress.done_steps : 0}/${path.steps.length} · ${pct}%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>

    <div class="section-row">
      <h3>Steps</h3>
      <button id="schedule-btn">Schedule from today</button>
    </div>
    <ul class="steps" id="steps"></ul>`;

  const stepsEl = detail.querySelector("#steps");
  path.steps.forEach((step, i) => {
    const cal = calByStep[step.id];
    const done = step.status === "done";
    const li = document.createElement("li");
    li.className = "step" + (done ? " done" : "");
    li.innerHTML = `
      <input type="checkbox" class="step-check" ${done ? "checked" : ""} />
      <span class="step-index">${i + 1}</span>
      <div class="step-body">
        <div class="step-title">${escapeHtml(step.title)}</div>
        ${step.content ? `<div class="step-content">${escapeHtml(step.content)}</div>` : ""}
        ${
          cal
            ? `<div class="step-date">📅 ${cal.scheduled_date}${
                cal.is_milestone ? '<span class="milestone">★ milestone</span>' : ""
              }</div>`
            : ""
        }
      </div>`;
    li.querySelector(".step-check").onchange = (e) =>
      toggleStep(step.id, e.target.checked, id);
    stepsEl.appendChild(li);
  });

  detail.querySelector("#schedule-btn").onclick = () => schedulePath(id);
}

async function toggleStep(stepId, checked, pathId) {
  await api.patch(`/api/steps/${stepId}/status`, {
    status: checked ? "done" : "not_started",
  });
  await refreshPaths();
  await renderDetail(pathId);
}

async function schedulePath(pathId) {
  const today = new Date().toISOString().slice(0, 10);
  await api.post(`/api/paths/${pathId}/schedule`, {
    start_date: today,
    days_between: 2,
    skip_weekends: true,
    milestone_every: 3,
  });
  await renderDetail(pathId);
}

// ---- Generate ----
document.getElementById("generate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("generate-btn");
  const hint = document.getElementById("generate-hint");
  const topic = document.getElementById("topic").value.trim();
  const difficulty = document.getElementById("difficulty").value;
  if (!topic) return;

  btn.disabled = true;
  btn.textContent = "Generating…";
  hint.textContent = "";
  try {
    const path = await api.post("/api/paths", { topic, difficulty });
    document.getElementById("topic").value = "";
    await refreshPaths();
    await selectPath(path.id);
  } catch (err) {
    hint.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate";
  }
});

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

// ---- Boot ----
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
(async function init() {
  await refreshEngines();
  await refreshPaths();
  if (state.paths.length > 0) await selectPath(state.paths[0].id);
})();
