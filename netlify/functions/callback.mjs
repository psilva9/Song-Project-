// POST /api/callback — SunoAPI requires a callBackUrl. The app polls for status,
// so this endpoint simply acknowledges the webhook.
export default async () => new Response(JSON.stringify({ received: true }), {
  status: 200,
  headers: { "content-type": "application/json" },
});

export const config = { path: "/api/callback" };
