import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

let server, calls = [];
before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
      res.setHeader("content-type", "application/json");
      const u = new URL(req.url, "http://x");
      if (u.pathname === "/api/v1/generate") return res.end(JSON.stringify({ code: 200, msg: "success", data: { taskId: "task123" } }));
      if (u.pathname === "/api/v1/generate/credit") return res.end(JSON.stringify({ code: 200, msg: "success", data: 42 }));
      if (u.pathname === "/api/v1/generate/record-info") return res.end(JSON.stringify({ code: 200, msg: "success", data: {
        taskId: u.searchParams.get("taskId"), status: "SUCCESS",
        response: { sunoData: [{ id: "a1", title: "Song", tags: "pop", prompt: "[Verse] hi", audio_url: "https://x/a.mp3", stream_audio_url: "https://x/s", image_url: "https://x/i.jpg", duration: 120.5 }] },
      } }));
      if (u.pathname === "/api/v1/lyrics") return res.end(JSON.stringify({ code: 429, msg: "Insufficient credits", data: null }));
      res.statusCode = 404; res.end("{}");
    });
  });
  await new Promise((r) => server.listen(0, r));
  process.env.SUNO_API_BASE = `http://127.0.0.1:${server.address().port}`;
  process.env.SUNO_API_KEY = "test-key";
  process.env.URL = "https://example.netlify.app";
});
after(() => server.close());

const post = (path, body, headers = {}) => new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("buildGenerateBody: simple mode strips custom-only fields", async () => {
  const { buildGenerateBody } = await import("../netlify/lib/suno.mjs");
  const { body } = buildGenerateBody({ customMode: false, prompt: "hi", style: "pop", title: "x", duration: 50, model: "BAD" }, "cb");
  assert.deepEqual(body, { customMode: false, instrumental: false, model: "V6", callBackUrl: "cb", style: "pop", prompt: "hi" });
});

test("buildGenerateBody: simple mode requires style or lyrics", async () => {
  const { buildGenerateBody } = await import("../netlify/lib/suno.mjs");
  assert.ok(buildGenerateBody({ customMode: false, prompt: "hi" }, "cb").error);
});

test("buildGenerateBody: custom mode clamps and drops vocals fields when instrumental", async () => {
  const { buildGenerateBody } = await import("../netlify/lib/suno.mjs");
  const { body } = buildGenerateBody({ customMode: true, instrumental: true, style: "jazz", lyrics: "la", vocalGender: "f", duration: 999, styleWeight: 1.234, audioWeight: 0.5, variety: 7, title: "T".repeat(100) }, "cb");
  assert.equal(body.duration, 360);
  assert.equal(body.styleWeight, 1);
  assert.equal(body.variety, 4);
  assert.equal(body.title.length, 80);
  assert.equal(body.lyrics, undefined);
  assert.equal(body.vocalGender, undefined);
  assert.equal(body.audioWeight, undefined);
});

test("POST /api/generate forwards to SunoAPI with bearer key and callback", async () => {
  const { default: handler } = await import("../netlify/functions/generate.mjs");
  calls = [];
  const res = await handler(post("/api/generate", { customMode: false, prompt: "a song", style: "pop", model: "V6_MINI" }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { taskId: "task123" });
  assert.equal(calls[0].auth, "Bearer test-key");
  assert.equal(calls[0].body.callBackUrl, "https://example.netlify.app/api/callback");
  assert.equal(calls[0].body.model, "V6_MINI");
});

test("GET /api/status simplifies tracks", async () => {
  const { default: handler } = await import("../netlify/functions/status.mjs");
  const res = await handler(new Request("http://localhost/api/status?taskId=task123"));
  const data = await res.json();
  assert.equal(data.status, "SUCCESS");
  assert.equal(data.tracks[0].audioUrl, "https://x/a.mp3");
  assert.equal(data.tracks[0].lyrics, "[Verse] hi");
});

test("GET /api/status rejects bad taskId", async () => {
  const { default: handler } = await import("../netlify/functions/status.mjs");
  const res = await handler(new Request("http://localhost/api/status?taskId=../../etc"));
  assert.equal(res.status, 400);
});

test("GET /api/credits", async () => {
  const { default: handler } = await import("../netlify/functions/credits.mjs");
  assert.deepEqual(await (await handler(new Request("http://localhost/api/credits"))).json(), { credits: 42 });
});

test("upstream error codes are surfaced", async () => {
  const { default: handler } = await import("../netlify/functions/lyrics.mjs");
  const res = await handler(post("/api/lyrics", { prompt: "love" }));
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, "Insufficient credits");
});

test("APP_PASSWORD gate", async () => {
  const { default: handler } = await import("../netlify/functions/credits.mjs");
  process.env.APP_PASSWORD = "secret";
  try {
    assert.equal((await handler(new Request("http://localhost/api/credits"))).status, 401);
    const ok = await handler(new Request("http://localhost/api/credits", { headers: { "x-app-password": "secret" } }));
    assert.equal(ok.status, 200);
  } finally {
    delete process.env.APP_PASSWORD;
  }
});
