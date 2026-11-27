import { getLocale } from "next-intl/server";
import { AppError, NotFoundError } from "@/lib/errors";
import { requireOrgAction } from "@/features/organizations/current";
import { assertCan } from "@/features/organizations/context";
import { getOrganization, getOrganizationLogo } from "@/features/organizations/service";
import { htmlToPdf, PdfUnavailableError } from "@/features/sales/pdf";
import { periodKey } from "@/features/payroll/calc";
import { renderPayslipsHtml, renderSalarySheetHtml, type DocLang } from "@/features/payroll/documents";
import { buildSalarySheetWorkbook } from "@/features/payroll/export";
import { getSheet, logPayrollExport } from "@/features/payroll/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * GET /api/payroll/{id}/xlsx                      salary sheet as Excel
 * GET /api/payroll/{id}/sheet?lang=en|ar[&view=1]  salary sheet PDF (view=1: printable page)
 * GET /api/payroll/{id}/payslips?lang=…[&line=…][&view=1]  payslips PDF, all workers or one
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id: rawId, file } = await params;
  if (!["xlsx", "sheet", "payslips"].includes(file)) return new Response(null, { status: 404 });
  const id = rawId.slice(0, 40);
  const sp = new URL(req.url).searchParams;
  try {
    const ctx = await requireOrgAction();
    assertCan(ctx, "data.export");
    const [sheet, org] = await Promise.all([getSheet(ctx, id), getOrganization(ctx)]);
    const key = periodKey(sheet.year, sheet.month);

    if (file === "xlsx") {
      const locale = (await getLocale()) === "ar" ? "ar" : "en";
      const bytes = await buildSalarySheetWorkbook(sheet, { locale, companyName: locale === "ar" && org.nameAr ? org.nameAr : org.nameEn });
      await logPayrollExport(ctx, id, "xlsx");
      return new Response(bytes, { headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="salary-sheet-${key}.xlsx"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }

    const lang: DocLang = sp.get("lang") === "ar" ? "ar" : "en";
    const view = sp.get("view") === "1";
    const lineId = sp.get("line")?.slice(0, 40) ?? "";
    const lines = file === "payslips" ? (lineId ? sheet.lines.filter((l) => l.id === lineId) : sheet.lines) : sheet.lines;
    if (lines.length === 0) throw new NotFoundError();
    const logo = await getOrganizationLogo(ctx.organizationId);
    const logoDataUri = logo ? `data:${logo.mimeType};base64,${Buffer.from(logo.data).toString("base64")}` : null;
    const self = new URL(req.url);
    self.searchParams.delete("view");
    const opts = { lang, forPdf: !view, logoDataUri, pdfHref: `${self.pathname}?${self.searchParams.toString()}`, backHref: `/app/payroll/${id}` };
    const html = file === "sheet" ? renderSalarySheetHtml(sheet, org, opts) : renderPayslipsHtml(sheet, lines, org, opts);
    if (view) return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });

    const pdf = await htmlToPdf(html);
    await logPayrollExport(ctx, id, `${file}-pdf`);
    const who = lineId && lines[0] ? `-${lines[0].workerName.replace(/[^\w-]+/g, "-").slice(0, 40)}` : "";
    const name = `${file === "sheet" ? "salary-sheet" : "payslips"}-${key}${who}${lang === "ar" ? "-ar" : ""}.pdf`;
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof PdfUnavailableError) {
      return new Response("PDF is not available on this server right now. Open the print view and choose Print > Save as PDF.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    if (e instanceof NotFoundError) return new Response("Not found", { status: 404 });
    if (e instanceof AppError) return new Response(null, { status: e.code === "unauthorized" ? 401 : 403 });
    throw e;
  }
}
