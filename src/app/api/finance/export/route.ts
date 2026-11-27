import ExcelJS from "exceljs";
import { getLocale, getTranslations } from "next-intl/server";
import { AppError } from "@/lib/errors";
import { requireOrgAction } from "@/features/organizations/current";
import { parseEntryQuery } from "@/features/finance/query";
import { exportEntries } from "@/features/finance/service";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** GET /api/finance/export?… — the finance list with the same filters, as Excel. Allowed in read-only mode. */
export async function GET(req: Request) {
  try {
    const ctx = await requireOrgAction();
    const query = parseEntryQuery(Object.fromEntries(new URL(req.url).searchParams));
    const [rows, locale, t, ts] = await Promise.all([exportEntries(ctx, query), getLocale(), getTranslations("finance"), getTranslations("sales")]);
    const ar = locale === "ar";
    const name = (x: { nameEn: string; nameAr: string | null } | null) => (x ? (ar && x.nameAr ? x.nameAr : x.nameEn) : "");
    const sar = (h: number) => h / 100;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(t("tabs.transactions"), { views: [{ rightToLeft: ar, state: "frozen", ySplit: 1 }] });
    ws.columns = [
      { header: t("fields.date"), key: "date", width: 12, style: { numFmt: "yyyy-mm-dd" } },
      { header: t("categories.kind"), key: "kind", width: 10 },
      { header: t("fields.categoryId"), key: "category", width: 26 },
      { header: t("fields.description"), key: "description", width: 30 },
      { header: t("fields.client"), key: "client", width: 26 },
      { header: t("fields.siteId"), key: "site", width: 22 },
      { header: t("fields.method"), key: "method", width: 14 },
      { header: t("fields.reference"), key: "reference", width: 18 },
      { header: t("fields.amount"), key: "amount", width: 14, style: { numFmt: "#,##0.00" } },
      { header: t("fields.vat"), key: "vat", width: 12, style: { numFmt: "#,##0.00" } },
      { header: t("fields.net"), key: "net", width: 14, style: { numFmt: "#,##0.00" } },
      { header: t("fields.source"), key: "source", width: 18 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const e of rows) {
      // Expenses are negative so a SUM of the column is the net result.
      const sign = e.kind === "INCOME" ? 1 : -1;
      ws.addRow({
        date: e.date,
        kind: t(`kinds.${e.kind}`),
        category: name(e.category),
        description: e.description ?? "",
        client: name(e.client),
        site: e.site?.name ?? "",
        method: e.method ? ts(`methods.${e.method}`) : "",
        reference: e.reference ?? "",
        amount: sar(sign * e.amount),
        vat: sar(sign * e.vatAmount),
        net: sar(sign * (e.amount - e.vatAmount)),
        source: t(`sources.${e.source}`) + (e.voidedAt ? ` (${t("voided")})` : ""),
      });
    }
    const bytes = await wb.xlsx.writeBuffer();
    return new Response(bytes, {
      headers: {
        "Content-Type": XLSX,
        "Content-Disposition": `attachment; filename="finance-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response(null, { status: e.code === "unauthorized" ? 401 : 403 });
    throw e;
  }
}
