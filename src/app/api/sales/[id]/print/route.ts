import { errorResponse, loadDocumentHtml } from "@/features/sales/document-route";

/** Printable document (browser view with Print and PDF buttons). Read-only companies can print too. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { html } = await loadDocumentHtml(req, (await params).id, false);
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
