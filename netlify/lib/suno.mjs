// Shared helpers for talking to SunoAPI.org from Netlify Functions.
// The API key lives ONLY in the SUNO_API_KEY environment variable (set it in
// Netlify: Site configuration -> Environment variables). It never reaches the browser.

export const SUNO_BASE = process.env.SUNO_API_BASE || "https://api.sunoapi.org";

export const MODELS = ["V6", "V6_WILD", "V6_MINI"];

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Optional shared password gate (set APP_PASSWORD in Netlify to enable). */
export function checkAuth(req) {
  const required = process.env.APP_PASSWORD;
  if (!required) return null;
  const given = req.headers.get("x-app-password") || "";
  if (given !== required) return json(401, { error: "Wrong or missing app password.", needPassword: true });
  return null;
}

export function callbackUrl(req) {
  // SunoAPI requires a callBackUrl. We poll for status instead, so the callback
  // endpoint just acknowledges receipt.
  const origin = process.env.URL || new URL(req.url).origin;
  return `${origin}/api/callback`;
}

const ERROR_HINTS = {
  400: "Invalid parameters.",
  401: "The server's SunoAPI key is invalid or missing.",
  405: "Rate limit exceeded. Please wait a moment.",
  413: "Prompt or lyrics are too long.",
  429: "Out of SunoAPI credits. Top up at sunoapi.org.",
  430: "Too many requests. Please try again shortly.",
  455: "SunoAPI is under maintenance. Try again later.",
  500: "SunoAPI server error. Try again.",
};

/** Call SunoAPI and normalise the {code,msg,data} envelope into a Response. */
export async function suno(path, { method = "GET", body, query } = {}) {
  const key = process.env.SUNO_API_KEY;
  if (!key) return { ok: false, res: json(500, { error: "SUNO_API_KEY is not configured on the server." }) };

  const url = new URL(path, SUNO_BASE);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  let upstream;
  try {
    upstream = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    return { ok: false, res: json(502, { error: "Could not reach SunoAPI.", detail: String(err) }) };
  }

  let payload;
  try {
    payload = await upstream.json();
  } catch {
    return { ok: false, res: json(502, { error: `SunoAPI returned an unreadable response (HTTP ${upstream.status}).` }) };
  }

  const code = payload?.code ?? upstream.status;
  if (code !== 200) {
    const status = code >= 400 && code < 600 ? code : 502;
    const msg = payload?.msg && payload.msg !== "success" ? payload.msg : ERROR_HINTS[code] || "Request failed.";
    return { ok: false, res: json(status, { error: msg, code }) };
  }
  return { ok: true, data: payload.data };
}

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

const clampNum = (v, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
};
const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/**
 * Validate and whitelist the client's generate request into a SunoAPI body,
 * following the rules in https://docs.sunoapi.org/suno-api/generate-music
 * Returns { body } or { error }.
 */
export function buildGenerateBody(input, cbUrl) {
  if (!input || typeof input !== "object") return { error: "Invalid request body." };

  const customMode = Boolean(input.customMode);
  const instrumental = Boolean(input.instrumental);
  const model = MODELS.includes(input.model) ? input.model : "V6";

  const body = { customMode, instrumental, model, callBackUrl: cbUrl };

  const style = str(input.style, 1000);
  const lyrics = instrumental ? undefined : str(input.lyrics, 5000);
  if (style) body.style = style;
  if (lyrics) body.lyrics = lyrics;

  if (!customMode) {
    const prompt = str(input.prompt, 3000);
    if (prompt) body.prompt = prompt;
    if (!style && !lyrics) return { error: "Pick a style/genre (or add lyrics) so SunoAPI knows what to make." };
    if (!prompt && !style) return { error: "Describe the song you want." };
    return { body };
  }

  // Custom mode
  const title = str(input.title, 80);
  const negativeTags = str(input.negativeTags, 1000);
  if (title) body.title = title;
  if (negativeTags) body.negativeTags = negativeTags;
  if (!style && !lyrics && !negativeTags) return { error: "Custom mode needs at least a style, lyrics, or tags to avoid." };

  if (input.vocalGender === "m" || input.vocalGender === "f") {
    if (!instrumental) body.vocalGender = input.vocalGender;
  }

  const duration = clampNum(input.duration, 10, 360);
  if (duration !== undefined) body.duration = Math.round(duration);

  const round2 = (n) => Math.round(n * 100) / 100;
  const styleWeight = clampNum(input.styleWeight, 0, 1);
  const weirdness = clampNum(input.weirdnessConstraint, 0, 1);
  const audioWeight = clampNum(input.audioWeight, 0, 1);
  const variety = clampNum(input.variety, 0, 4);
  if (styleWeight !== undefined) body.styleWeight = round2(styleWeight);
  if (weirdness !== undefined) body.weirdnessConstraint = round2(weirdness);
  if (audioWeight !== undefined && !instrumental) body.audioWeight = round2(audioWeight);
  if (variety !== undefined) body.variety = Math.round(variety);

  return { body };
}

/** Reduce a record-info payload to what the UI needs. */
export function simplifyMusicRecord(data) {
  const tracks = (data?.response?.sunoData || []).map((t) => ({
    id: t.id,
    title: t.title || "Untitled",
    tags: t.tags || "",
    lyrics: t.prompt || "",
    duration: t.duration || null,
    audioUrl: t.audio_url || t.source_audio_url || "",
    streamUrl: t.stream_audio_url || t.source_stream_audio_url || "",
    imageUrl: t.image_url || t.source_image_url || "",
    model: t.model_name || "",
    createTime: t.createTime || "",
  }));
  return {
    taskId: data?.taskId,
    status: data?.status || "PENDING",
    errorMessage: data?.errorMessage || null,
    tracks,
  };
}
