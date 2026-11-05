import { checkAuth, json, suno } from "../lib/suno.mjs";

// GET /api/credits -> { credits }
export default async (req) => {
  const denied = checkAuth(req);
  if (denied) return denied;
  const r = await suno("/api/v1/generate/credit");
  if (!r.ok) return r.res;
  return json(200, { credits: r.data });
};

export const config = { path: "/api/credits" };
