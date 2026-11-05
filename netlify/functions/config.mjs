// GET /api/config -> tells the UI whether a password is required.
export default async () =>
  new Response(JSON.stringify({ passwordRequired: Boolean(process.env.APP_PASSWORD) }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const config = { path: "/api/config" };
