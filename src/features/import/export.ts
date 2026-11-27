import { tenantDb, tenantTransaction } from "@/lib/db";
import { decryptField } from "@/lib/field-crypto";
import { halalasToInput, toDateInput } from "@/lib/parse";
import { writeAudit } from "@/features/audit/log";
import { assertCan, type OrgContext } from "@/features/organizations/context";
import type { ImportType } from "./definitions";

/**
 * Rows for the Excel export, in the same columns as the import template.
 * Allowed in read-only mode (customers can always take their data). The workforce
 * export contains full Iqama and passport numbers, so it is written to the audit log.
 */
export async function exportRows(ctx: OrgContext, type: ImportType, archived?: boolean): Promise<Record<string, string>[]> {
  assertCan(ctx, "data.export");
  const db = tenantDb(ctx.organizationId);
  // undefined = everything (full data export), true = archived only, false = active only.
  const where = archived === undefined ? {} : { archivedAt: archived ? { not: null } : null };
  const s = (v: string | null | undefined) => v ?? "";

  if (type === "clients") {
    const clients = await db.client.findMany({ where, orderBy: { nameEn: "asc" } });
    return clients.map((c) => ({
      nameEn: c.nameEn,
      nameAr: s(c.nameAr),
      vatNumber: s(c.vatNumber),
      crNumber: s(c.crNumber),
      contactName: s(c.contactName),
      phone: s(c.phone),
      email: s(c.email),
      addressLine: s(c.addressLine),
      city: s(c.city),
      postalCode: s(c.postalCode),
      notes: s(c.notes),
    }));
  }
  if (type === "sites") {
    const sites = await db.site.findMany({ where, include: { client: { select: { nameEn: true } } }, orderBy: [{ client: { nameEn: "asc" } }, { name: "asc" }] });
    return sites.map((x) => ({ clientName: x.client.nameEn, name: x.name, city: s(x.city), address: s(x.address), notes: s(x.notes) }));
  }
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const workers = await tx.worker.findMany({
      where,
      include: { site: { select: { name: true, client: { select: { nameEn: true } } } } },
      orderBy: { name: "asc" },
    });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "workers.exported",
      entityType: "Worker",
      metadata: { count: workers.length, archived: archived ?? "all" },
    });
    return workers.map((w) => ({
      name: w.name,
      nameAr: s(w.nameAr),
      iqamaNumber: decryptField(w.iqamaEncrypted),
      nationality: s(w.nationality),
      jobTitle: s(w.jobTitle),
      phone: s(w.phone),
      basicSalary: halalasToInput(w.basicSalary),
      housingAllowance: halalasToInput(w.housingAllowance),
      transportAllowance: halalasToInput(w.transportAllowance),
      otherAllowance: halalasToInput(w.otherAllowance),
      clientName: s(w.site?.client.nameEn),
      siteName: s(w.site?.name),
      iqamaExpiry: toDateInput(w.iqamaExpiry),
      passportNumber: w.passportEncrypted ? decryptField(w.passportEncrypted) : "",
      passportExpiry: toDateInput(w.passportExpiry),
    }));
  });
}
