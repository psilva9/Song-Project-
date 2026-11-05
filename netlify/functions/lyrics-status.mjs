import { checkAuth, json, suno } from "../lib/suno.mjs";

// GET /api/lyrics-status?taskId=...  -> lyrics task status + variations
export default async (req) => {
  const denied = checkAuth(req);
  if (denied) return denied;

  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId || !/^[\w-]{1,128}$/.test(taskId)) return json(400, { error: "Missing or invalid taskId." });

  const r = await suno("/api/v1/lyrics/record-info", { query: { taskId } });
  if (!r.ok) return r.res;
  const d = r.data || {};
  const options = (d.response?.data || [])
    .filter((x) => x.status !== "failed" && x.text)
    .map((x) => ({ title: x.title || "", text: x.text }));
  return json(200, { status: d.status || "PENDING", errorMessage: d.errorMessage || null, options });
};

export const config = { path: "/api/lyrics-status" };
