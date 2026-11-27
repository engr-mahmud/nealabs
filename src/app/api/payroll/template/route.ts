import { getLocale } from "next-intl/server";
import { AppError } from "@/lib/errors";
import { requireOrgAction } from "@/features/organizations/current";
import { getOrganization } from "@/features/organizations/service";
import { parsePeriod, periodKey } from "@/features/payroll/calc";
import { monthLabel } from "@/features/payroll/documents";
import { timesheetWorkers } from "@/features/payroll/service";
import { buildTimesheetTemplate } from "@/features/payroll/timesheet";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** GET /api/payroll/template?month=2026-11[&site=…][&sheet=…] – the timesheet for a month, filled with the workers. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const period = parsePeriod(sp.get("month"));
  if (!period) return new Response("Choose a month", { status: 400 });
  try {
    const ctx = await requireOrgAction();
    const locale = (await getLocale()) === "ar" ? "ar" : "en";
    const siteId = sp.get("site")?.slice(0, 40) || null;
    const sheetId = sp.get("sheet")?.slice(0, 40) || null;
    const [workers, org] = await Promise.all([timesheetWorkers(ctx, period.year, period.month, siteId, sheetId), getOrganization(ctx)]);
    const bytes = await buildTimesheetTemplate(workers, {
      locale,
      periodLabel: monthLabel(period.year, period.month, locale),
      companyName: locale === "ar" && org.nameAr ? org.nameAr : org.nameEn,
    });
    return new Response(bytes, {
      headers: {
        "Content-Type": XLSX,
        "Content-Disposition": `attachment; filename="timesheet-${periodKey(period.year, period.month)}.xlsx"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response(null, { status: e.code === "unauthorized" ? 401 : 403 });
    throw e;
  }
}
