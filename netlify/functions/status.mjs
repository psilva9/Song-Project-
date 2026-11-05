import { checkAuth, json, simplifyMusicRecord, suno } from "../lib/suno.mjs";

// GET /api/status?taskId=...  -> music task status + tracks
export default async (req) => {
  const denied = checkAuth(req);
  if (denied) return denied;

  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId || !/^[\w-]{1,128}$/.test(taskId)) return json(400, { error: "Missing or invalid taskId." });

  const r = await suno("/api/v1/generate/record-info", { query: { taskId } });
  if (!r.ok) return r.res;
  return json(200, simplifyMusicRecord(r.data));
};

export const config = { path: "/api/status" };
