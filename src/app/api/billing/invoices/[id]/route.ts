import { NotFoundError } from "@/lib/errors";
import { requireOrgAction } from "@/features/organizations/current";
import { renderSubscriptionInvoiceHtml } from "@/features/billing/invoice-html";
import { getSubscriptionInvoice } from "@/features/billing/service";
import { errorResponse } from "@/features/sales/document-route";
import { htmlToPdf, PdfUnavailableError } from "@/features/sales/pdf";

/** Subscription tax invoice: ?format=pdf downloads a PDF, otherwise a printable page. ?lang=ar for Arabic first. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireOrgAction();
    const { id } = await params;
    const url = new URL(req.url);
    const lang = url.searchParams.get("lang") === "ar" ? "ar" : "en";
    const pdf = url.searchParams.get("format") === "pdf";
    const invoice = await getSubscriptionInvoice(ctx, id.slice(0, 40));
    const html = await renderSubscriptionInvoiceHtml(invoice, {
      lang,
      forPdf: pdf,
      pdfHref: `/api/billing/invoices/${invoice.id}?format=pdf&lang=${lang}`,
      backHref: "/app/billing",
    });
    const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };
    if (!pdf) return new Response(html, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
    const bytes = await htmlToPdf(html);
    const fileName = `${invoice.number}${lang === "ar" ? "-ar" : ""}.pdf`;
    return new Response(Buffer.from(bytes), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileName}"` } });
  } catch (e) {
    if (e instanceof PdfUnavailableError) return new Response("PDF is not available right now. Use Print instead.", { status: 503 });
    if (e instanceof NotFoundError) return new Response("Not found", { status: 404 });
    return errorResponse(e);
  }
}
