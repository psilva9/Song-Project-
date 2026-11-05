import { callbackUrl, checkAuth, json, readJson, suno } from "../lib/suno.mjs";

// POST /api/lyrics { prompt }  -> starts a lyrics task, returns { taskId }
export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const denied = checkAuth(req);
  if (denied) return denied;

  const input = await readJson(req);
  const prompt = typeof input?.prompt === "string" ? input.prompt.trim() : "";
  if (!prompt) return json(400, { error: "Describe what the lyrics should be about." });
  if (prompt.length > 200) return json(400, { error: "Lyrics idea must be 200 characters or fewer." });

  const r = await suno("/api/v1/lyrics", {
    method: "POST",
    body: { prompt, callBackUrl: callbackUrl(req) },
  });
  if (!r.ok) return r.res;
  return json(200, { taskId: r.data?.taskId });
};

export const config = { path: "/api/lyrics" };
