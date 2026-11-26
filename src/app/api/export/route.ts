import { AppError } from "@/lib/errors";
import { requireOrgAction } from "@/features/organizations/current";
import { exportOrganizationData } from "@/features/organizations/service";

/** Data export. Works in read-only mode too: customers can always take their data. */
export async function GET() {
  try {
    const ctx = await requireOrgAction();
    const data = await exportOrganizationData(ctx);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="company-export-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response(null, { status: e.code === "unauthorized" ? 401 : 403 });
    throw e;
  }
}
