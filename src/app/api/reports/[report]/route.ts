import ExcelJS from "exceljs";
import { getLocale, getTranslations } from "next-intl/server";
import { AppError } from "@/lib/errors";
import { requireOrgAction } from "@/features/organizations/current";
import { agingBuckets, monthlyTrend, receivablesAging } from "@/features/reports/service";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const sar = (h: number) => h / 100;
const money = { numFmt: "#,##0.00" };

/** GET /api/reports/receivables | /api/reports/monthly — the report as Excel. Allowed in read-only mode. */
export async function GET(_req: Request, { params }: { params: Promise<{ report: string }> }) {
  try {
    const { report } = await params;
    if (report !== "receivables" && report !== "monthly") return new Response(null, { status: 404 });
    const ctx = await requireOrgAction();
    const [locale, t] = await Promise.all([getLocale(), getTranslations("reports")]);
    const ar = locale === "ar";
    const wb = new ExcelJS.Workbook();

    if (report === "receivables") {
      const data = await receivablesAging(ctx);
      const ws = wb.addWorksheet(t("receivables.title"), { views: [{ rightToLeft: ar, state: "frozen", ySplit: 1 }] });
      ws.columns = [
        { header: t("receivables.client"), key: "client", width: 32 },
        { header: t("receivables.invoicesHeader"), key: "invoices", width: 10 },
        ...agingBuckets.map((b) => ({ header: t(`buckets.${b}`), key: b, width: 14, style: money })),
        { header: t("receivables.rowTotal"), key: "total", width: 16, style: money },
      ];
      for (const r of data.rows) {
        ws.addRow({ client: ar && r.nameAr ? r.nameAr : r.nameEn, invoices: r.invoices, ...Object.fromEntries(agingBuckets.map((b) => [b, sar(r.buckets[b])])), total: sar(r.total) });
      }
      const total = ws.addRow({ client: t("receivables.rowTotal"), invoices: data.totals.invoices, ...Object.fromEntries(agingBuckets.map((b) => [b, sar(data.totals[b])])), total: sar(data.totals.total) });
      total.font = { bold: true };
    } else {
      const data = await monthlyTrend(ctx, 12);
      const ws = wb.addWorksheet(t("monthly.title"), { views: [{ rightToLeft: ar, state: "frozen", ySplit: 1 }] });
      ws.columns = [
        { header: t("monthly.month"), key: "month", width: 14, style: { numFmt: "yyyy-mm" } },
        { header: t("monthly.income"), key: "income", width: 16, style: money },
        { header: t("monthly.expense"), key: "expense", width: 16, style: money },
        { header: t("monthly.profit"), key: "profit", width: 16, style: money },
      ];
      for (const r of data.rows) ws.addRow({ month: r.month, income: sar(r.income), expense: sar(r.expense), profit: sar(r.profit) });
      const total = ws.addRow({ month: t("receivables.rowTotal"), income: sar(data.totals.income), expense: sar(data.totals.expense), profit: sar(data.totals.profit) });
      total.font = { bold: true };
    }
    wb.worksheets[0]!.getRow(1).font = { bold: true };

    const bytes = await wb.xlsx.writeBuffer();
    return new Response(bytes, {
      headers: {
        "Content-Type": XLSX,
        "Content-Disposition": `attachment; filename="${report}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response(null, { status: e.code === "unauthorized" ? 401 : 403 });
    throw e;
  }
}
