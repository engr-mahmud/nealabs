import { errorResponse, loadDocumentHtml } from "@/features/sales/document-route";
import { htmlToPdf, PdfUnavailableError } from "@/features/sales/pdf";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Server-side PDF of a quotation, proforma or invoice (English or Arabic layout). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { html, fileName } = await loadDocumentHtml(req, (await params).id, true);
    const pdf = await htmlToPdf(html);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof PdfUnavailableError) {
      return new Response("PDF is not available on this server right now. Open the print view and choose Print > Save as PDF.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return errorResponse(e);
  }
}
