import { handleMoyasarWebhook } from "@/features/billing/webhook";

/** Payment gateway webhook (Moyasar). Not behind a session: authenticated by the secret token. */
export async function POST(req: Request) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > 64 * 1024) return new Response("too large", { status: 413 });
  const body = await req.text();
  if (body.length > 64 * 1024) return new Response("too large", { status: 413 });
  const result = await handleMoyasarWebhook(body);
  return new Response(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
