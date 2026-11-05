import { buildGenerateBody, callbackUrl, checkAuth, json, readJson, suno } from "../lib/suno.mjs";

// POST /api/generate  -> starts a music generation task, returns { taskId }
export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const denied = checkAuth(req);
  if (denied) return denied;

  const { body, error } = buildGenerateBody(await readJson(req), callbackUrl(req));
  if (error) return json(400, { error });

  const r = await suno("/api/v1/generate", { method: "POST", body });
  if (!r.ok) return r.res;
  return json(200, { taskId: r.data?.taskId });
};

export const config = { path: "/api/generate" };
