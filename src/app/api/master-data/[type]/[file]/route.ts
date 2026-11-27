import { getLocale } from "next-intl/server";
import { AppError } from "@/lib/errors";
import { requireOrgAction } from "@/features/organizations/current";
import { assertCan } from "@/features/organizations/context";
import { isImportType } from "@/features/import/definitions";
import { buildWorkbook } from "@/features/import/excel";
import { exportRows } from "@/features/import/export";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * GET /api/master-data/{clients|sites|workers}/{template|export}
 * The template is an empty sheet with the right headers; the export uses the same columns.
 */
export async function GET(req: Request, { params }: { params: Promise<{ type: string; file: string }> }) {
  const { type, file } = await params;
  if (!isImportType(type) || (file !== "template" && file !== "export")) return new Response(null, { status: 404 });
  try {
    const ctx = await requireOrgAction();
    const locale = (await getLocale()) === "ar" ? "ar" : "en";
    let rows: Record<string, string>[] | "template" = "template";
    if (file === "export") {
      rows = await exportRows(ctx, type, new URL(req.url).searchParams.get("archived") === "1");
    } else {
      assertCan(ctx, "data.read");
    }
    const bytes = await buildWorkbook(type, rows, locale);
    const date = new Date().toISOString().slice(0, 10);
    const name = file === "template" ? `${type}-template.xlsx` : `${type}-${date}.xlsx`;
    return new Response(bytes, {
      headers: {
        "Content-Type": XLSX,
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response(null, { status: e.code === "unauthorized" ? 401 : 403 });
    throw e;
  }
}
