// Song Studio front-end. Talks only to our own /api/* Netlify Functions;
// the SunoAPI key stays on the server.

const $ = (sel) => document.querySelector(sel);
const STORE_TRACKS = "songstudio.tracks.v1";
const STORE_JOBS = "songstudio.jobs.v1";
const STORE_PW = "songstudio.pw";
const POLL_MS = 5000;
const MAX_POLL_MS = 10 * 60 * 1000;

const GENRES = [
  "Pop", "Hip-hop", "R&B", "Rock", "Indie", "EDM", "Lo-fi", "Jazz",
  "Country", "Latin", "Afrobeats", "K-pop", "Reggaeton", "Classical", "Cinematic", "Metal",
];
const SURPRISES = [
  ["A feel-good anthem about chasing dreams in a small town", "Indie pop, anthemic, claps"],
  ["Late-night drive through neon city streets, missing someone", "Synthwave, dreamy, retro"],
  ["A playful song about a cat who thinks it's royalty", "Funk, upbeat, brass"],
  ["Sunday morning coffee and slow sunshine", "Lo-fi, acoustic guitar, mellow"],
  ["Victory lap after a hard year — we made it", "Hip-hop, trap drums, triumphant"],
  ["Dancing barefoot at a beach party under the stars", "Reggaeton, tropical, summer"],
  ["An epic battle between dragons above a frozen sea", "Cinematic, orchestral, epic choir"],
];
const VARIETY = ["Off", "Normal", "High", "Extra", "Max"];
const STATUS_TEXT = {
  PENDING: "Queued — warming up the studio…",
  TEXT_SUCCESS: "Lyrics written — composing music…",
  FIRST_SUCCESS: "First version ready — finishing the second…",
  SUCCESS: "Done!",
  CREATE_TASK_FAILED: "Couldn't start this song.",
  GENERATE_AUDIO_FAILED: "Generation failed.",
  CALLBACK_EXCEPTION: "Something went wrong.",
  SENSITIVE_WORD_ERROR: "Blocked: the prompt contains disallowed words.",
};
const FAILED = new Set(["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR"]);

let mode = "simple";
let tracks = load(STORE_TRACKS, []);
let jobs = load(STORE_JOBS, []);
let currentId = null;

// ---------- storage ----------
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save() {
  try {
    localStorage.setItem(STORE_TRACKS, JSON.stringify(tracks));
    localStorage.setItem(STORE_JOBS, JSON.stringify(jobs));
  } catch { /* storage unavailable; app still works for this session */ }
}

// ---------- API ----------
async function api(path, opts = {}) {
  const headers = { ...(opts.body ? { "content-type": "application/json" } : {}) };
  const pw = sessionStorage.getItem(STORE_PW);
  if (pw) headers["x-app-password"] = pw;
  const res = await fetch(path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  if (res.status === 401 && data.needPassword) {
    await askPassword();
    return api(path, opts);
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function askPassword() {
  return new Promise((resolve) => {
    const dlg = $("#pwDialog");
    dlg.addEventListener("close", () => {
      sessionStorage.setItem(STORE_PW, $("#pwInput").value);
      resolve();
    }, { once: true });
    if (!dlg.open) dlg.showModal();
  });
}

async function refreshCredits() {
  const el = $("#credits");
  try {
    const { credits } = await api("/api/credits");
    $("#creditsText").textContent = `Credits: ${Number(credits).toLocaleString()}`;
    el.className = "credits " + (credits > 0 ? "ok" : "bad");
  } catch (e) {
    $("#creditsText").textContent = "Credits unavailable";
    el.className = "credits bad";
    el.title = e.message;
  }
}

// ---------- UI helpers ----------
function toast(msg, ms = 3200) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), ms);
}
function showError(msg) {
  const el = $("#formError");
  el.textContent = msg || "";
  el.hidden = !msg;
}
function fmtTime(sec) {
  if (!sec && sec !== 0) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
const svg = (d) => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", "22"); s.setAttribute("height", "22");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("fill", "currentColor"); p.setAttribute("d", d); s.append(p);
  return s;
};
const ICON_PLAY = "M8 5v14l11-7z";
const ICON_PAUSE = "M6 5h4v14H6zm8 0h4v14h-4z";

// ---------- form setup ----------
function setMode(m) {
  mode = m;
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.mode === m;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on);
  });
  document.querySelector(".mode-simple").hidden = m !== "simple";
  document.querySelector(".mode-custom").hidden = m !== "custom";
  showError("");
}
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));

// Genre chips toggle tokens inside the style input
const styleInput = $("#style");
function styleTokens() {
  return styleInput.value.split(",").map((s) => s.trim()).filter(Boolean);
}
function syncChips() {
  const set = new Set(styleTokens().map((s) => s.toLowerCase()));
  document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", set.has(c.dataset.g.toLowerCase())));
}
GENRES.forEach((g) => {
  $("#chips").append(h("button", {
    type: "button", class: "chip", "data-g": g,
    onclick: () => {
      const toks = styleTokens();
      const i = toks.findIndex((t) => t.toLowerCase() === g.toLowerCase());
      if (i >= 0) toks.splice(i, 1); else toks.unshift(g);
      styleInput.value = toks.join(", ");
      syncChips();
    },
  }, g));
});
styleInput.addEventListener("input", syncChips);

// counters
document.querySelectorAll(".counter").forEach((c) => {
  const input = document.getElementById(c.dataset.for);
  const upd = () => (c.textContent = `${input.value.length} / ${input.maxLength}`);
  input.addEventListener("input", upd); upd();
});

// sliders
const bindRange = (id, outId, fmt) => {
  const r = $(id), o = $(outId);
  const upd = () => (o.textContent = fmt(Number(r.value)));
  r.addEventListener("input", upd); upd();
};
bindRange("#duration", "#durationVal", fmtTime);
bindRange("#styleWeight", "#styleWeightVal", (v) => v.toFixed(2));
bindRange("#weirdness", "#weirdnessVal", (v) => v.toFixed(2));
bindRange("#variety", "#varietyVal", (v) => VARIETY[v]);

$("#instrumental").addEventListener("change", (e) => {
  $("#lyrics").disabled = e.target.checked;
  $("#vocalGender").disabled = e.target.checked;
});

$("#surpriseBtn").addEventListener("click", () => {
  const [p, s] = SURPRISES[Math.floor(Math.random() * SURPRISES.length)];
  $("#prompt").value = p;
  styleInput.value = s;
  $("#prompt").dispatchEvent(new Event("input"));
  syncChips();
});

// ---------- AI lyrics ----------
$("#aiLyricsBtn").addEventListener("click", () => {
  const box = $("#aiLyricsBox");
  box.hidden = !box.hidden;
  if (!box.hidden) $("#lyricsIdea").focus();
});
$("#lyricsIdea").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("#lyricsGoBtn").click(); } });
$("#lyricsGoBtn").addEventListener("click", async () => {
  const idea = $("#lyricsIdea").value.trim();
  const btn = $("#lyricsGoBtn");
  const out = $("#lyricsOptions");
  if (!idea) return toast("Type a lyrics idea first.");
  btn.disabled = true;
  btn.replaceChildren(h("span", { class: "spinner" }));
  out.replaceChildren(h("div", { class: "job-status" }, "Writing lyrics… (usually under a minute)"));
  try {
    const { taskId } = await api("/api/lyrics", { method: "POST", body: { prompt: idea } });
    const started = Date.now();
    while (Date.now() - started < MAX_POLL_MS) {
      await sleep(4000);
      const r = await api(`/api/lyrics-status?taskId=${encodeURIComponent(taskId)}`);
      if (r.status === "SUCCESS") {
        if (!r.options.length) throw new Error("No lyrics came back. Try another idea.");
        out.replaceChildren(h("div", { class: "job-status" }, "Pick one:"),
          ...r.options.map((o) => h("button", {
            type: "button", class: "lyrics-option",
            onclick: () => {
              $("#lyrics").value = o.text;
              if (o.title && !$("#title").value) $("#title").value = o.title;
              $("#lyrics").dispatchEvent(new Event("input"));
              $("#aiLyricsBox").hidden = true;
              toast("Lyrics added ✍️");
            },
          }, h("strong", {}, o.title || "Untitled"), h("span", {}, o.text.replace(/\s+/g, " ")))));
        return;
      }
      if (r.status !== "PENDING") throw new Error(r.errorMessage || STATUS_TEXT[r.status] || "Lyrics generation failed.");
    }
    throw new Error("Lyrics took too long. Try again.");
  } catch (e) {
    out.replaceChildren(h("div", { class: "error" }, e.message));
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate";
  }
});

// ---------- generate ----------
$("#genForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");
  const instrumental = $("#instrumental").checked;
  const body = { customMode: mode === "custom", instrumental, model: $("#model").value, style: styleInput.value.trim() };

  if (mode === "simple") {
    body.prompt = $("#prompt").value.trim();
    if (!body.prompt && !body.style) return showError("Describe your song or pick a style.");
    if (!body.style) return showError("Pick at least one style/genre chip (or type one) so the AI knows the vibe.");
  } else {
    Object.assign(body, {
      title: $("#title").value.trim(),
      lyrics: instrumental ? "" : $("#lyrics").value.trim(),
      negativeTags: $("#negativeTags").value.trim(),
      vocalGender: $("#vocalGender").value,
      duration: Number($("#duration").value),
      styleWeight: Number($("#styleWeight").value),
      weirdnessConstraint: Number($("#weirdness").value),
      variety: Number($("#variety").value),
    });
    if (!body.style && !body.lyrics && !body.negativeTags) return showError("Add some lyrics or a style.");
    if (!instrumental && !body.lyrics) return showError("Add lyrics (or use ✨ Write lyrics with AI), or switch on Instrumental.");
  }

  const btn = $("#generateBtn");
  btn.disabled = true;
  btn.replaceChildren(h("span", { class: "spinner" }), h("span", {}, "Starting…"));
  try {
    const { taskId } = await api("/api/generate", { method: "POST", body });
    const label = (mode === "custom" && body.title) || body.prompt || body.style || "New song";
    const job = { taskId, label: label.slice(0, 90), status: "PENDING", started: Date.now() };
    jobs.unshift(job);
    save();
    renderJobs();
    pollJob(job);
    toast("🎶 Your song is cooking! Usually takes 1–3 minutes.");
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.replaceChildren(h("span", { class: "btn-label" }, "Generate song"));
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollJob(job) {
  let failures = 0;
  while (true) {
    if (Date.now() - job.started > MAX_POLL_MS) {
      job.status = "TIMEOUT";
      job.error = "Timed out waiting for the song. Check back later or try again.";
      break;
    }
    await sleep(POLL_MS);
    try {
      const r = await api(`/api/status?taskId=${encodeURIComponent(job.taskId)}`);
      failures = 0;
      job.status = r.status;
      upsertTracks(job, r.tracks);
      if (r.status === "SUCCESS") break;
      if (FAILED.has(r.status)) { job.error = r.errorMessage || STATUS_TEXT[r.status]; break; }
      renderJobs();
    } catch (e) {
      if (++failures >= 5) { job.status = "ERROR"; job.error = e.message; break; }
    }
  }
  if (job.status === "SUCCESS") {
    jobs = jobs.filter((j) => j !== job);
    toast("✅ Song ready!");
    refreshCredits();
  }
  save();
  renderJobs();
  renderTracks();
}

function upsertTracks(job, list) {
  let changed = false;
  for (const t of list || []) {
    if (!t.id || !(t.audioUrl || t.streamUrl)) continue;
    const existing = tracks.find((x) => x.id === t.id);
    const rec = { ...t, taskId: job.taskId, ready: Boolean(t.audioUrl), savedAt: existing?.savedAt || Date.now() };
    if (existing) Object.assign(existing, rec); else tracks.unshift(rec);
    changed = true;
  }
  if (changed) { save(); renderTracks(); }
}

// ---------- rendering ----------
function renderJobs() {
  const wrap = $("#jobs");
  wrap.replaceChildren(...jobs.map((j) => {
    const failed = j.error || FAILED.has(j.status);
    return h("div", { class: "job" + (failed ? " failed" : "") },
      h("div", { class: "eq" }, h("i"), h("i"), h("i"), h("i")),
      h("div", { class: "job-text" },
        h("div", { class: "job-title" }, j.label),
        h("div", { class: "job-status" }, failed ? `⚠️ ${j.error || STATUS_TEXT[j.status]}` : STATUS_TEXT[j.status] || j.status)),
      failed ? h("button", { class: "btn small", onclick: () => { jobs = jobs.filter((x) => x !== j); save(); renderJobs(); updateEmpty(); } }, "Dismiss") : null);
  }));
  updateEmpty();
}

function renderTracks() {
  const wrap = $("#tracks");
  wrap.replaceChildren(...tracks.map((t) => {
    const playing = currentId === t.id && !$("#audio").paused;
    return h("article", { class: "track" + (playing ? " playing" : ""), "data-id": t.id },
      h("div", { class: "cover", onclick: () => playTrack(t) },
        t.imageUrl ? h("img", { src: t.imageUrl, alt: "", loading: "lazy", onerror: (e) => e.target.remove() }) : null,
        !t.ready ? h("span", { class: "badge" }, "Streaming preview") : t.duration ? h("span", { class: "badge" }, fmtTime(t.duration)) : null,
        h("div", { class: "play" }, h("div", { class: "play-btn" }, svg(playing ? ICON_PAUSE : ICON_PLAY)))),
      h("div", { class: "track-body" },
        h("div", { class: "track-title", title: t.title }, t.title),
        h("div", { class: "track-tags" }, t.tags),
        h("div", { class: "track-actions" },
          t.lyrics ? h("button", { class: "btn", onclick: () => showLyrics(t) }, "Lyrics") : null,
          t.ready ? h("a", { class: "btn", href: t.audioUrl, download: `${t.title}.mp3`, target: "_blank", rel: "noopener" }, "Download") : null,
          h("button", { class: "btn", title: "Remove from library", onclick: () => removeTrack(t.id) }, "✕"))));
  }));
  $("#clearBtn").hidden = tracks.length === 0;
  updateEmpty();
}

function updateEmpty() {
  $("#empty").hidden = tracks.length > 0 || jobs.length > 0;
}

function removeTrack(id) {
  tracks = tracks.filter((t) => t.id !== id);
  save();
  renderTracks();
}

$("#clearBtn").addEventListener("click", () => {
  if (!confirm("Remove all songs from this browser's library?")) return;
  tracks = [];
  save();
  renderTracks();
});

function showLyrics(t) {
  $("#dlgTitle").textContent = t.title;
  $("#dlgLyrics").textContent = t.lyrics;
  $("#lyricsDialog").showModal();
}
$("#dlgCopy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("#dlgLyrics").textContent); toast("Copied!"); } catch { toast("Copy failed"); }
});

// ---------- player ----------
const audio = $("#audio");
function playTrack(t) {
  if (currentId === t.id) {
    audio.paused ? audio.play() : audio.pause();
    return;
  }
  currentId = t.id;
  audio.src = t.audioUrl || t.streamUrl;
  $("#playerImg").src = t.imageUrl || "";
  $("#playerTitle").textContent = t.title;
  $("#playerTags").textContent = t.tags;
  $("#player").hidden = false;
  audio.play().catch(() => toast("Couldn't play this track yet — try again in a moment."));
}
["play", "pause", "ended"].forEach((ev) => audio.addEventListener(ev, renderTracks));

// ---------- boot ----------
(async function init() {
  renderTracks();
  renderJobs();
  try {
    const cfg = await (await fetch("/api/config")).json();
    if (cfg.passwordRequired && !sessionStorage.getItem(STORE_PW)) await askPassword();
  } catch { /* functions not reachable (e.g. opened as a static file) */ }
  refreshCredits();
  // resume any in-flight jobs from a previous visit
  jobs.filter((j) => !j.error && !FAILED.has(j.status) && j.status !== "TIMEOUT").forEach((j) => {
    if (Date.now() - j.started > MAX_POLL_MS) j.started = Date.now() - MAX_POLL_MS + 60000; // one more minute of checks
    pollJob(j);
  });
})();
