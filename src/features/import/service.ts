import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { tenantDb, tenantTransaction, type TxClient } from "@/lib/db";
import { blindIndex } from "@/lib/field-crypto";
import { writeAudit } from "@/features/audit/log";
import { assertCan, type OrgContext } from "@/features/organizations/context";
import { clientSchema } from "@/features/clients/schemas";
import { siteFieldsSchema } from "@/features/sites/schemas";
import { workerFieldsSchema } from "@/features/workforce/schemas";
import { iqamaColumns, passportColumns, plainColumns } from "@/features/workforce/service";
import { COLUMNS, type ImportType } from "./definitions";
import type { SheetRow } from "./excel";

/** Error codes are translation keys under "validation". */
export interface CheckedRow {
  rowNumber: number;
  values: Record<string, string>;
  errors: Record<string, string>;
}

interface Prepared {
  rows: CheckedRow[];
  /** Number of rows without errors that save() will insert. */
  valid: number;
  save: (tx: TxClient) => Promise<unknown>;
}

const key = (v: string) => v.trim().toLowerCase();

function zodErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[String(issue.path[0] ?? "row")] ??= issue.message;
  return errors;
}

async function prepareClients(ctx: OrgContext, sheet: SheetRow[]): Promise<Prepared> {
  const existing = await tenantDb(ctx.organizationId).client.findMany({ where: { archivedAt: null }, select: { nameEn: true } });
  const taken = new Set(existing.map((c) => key(c.nameEn)));
  const rows: CheckedRow[] = [];
  const inserts: Prisma.ClientCreateManyInput[] = [];
  for (const r of sheet) {
    const parsed = clientSchema.safeParse(r.values);
    const errors = parsed.success ? {} : zodErrors(parsed.error);
    if (parsed.success) {
      const name = key(parsed.data.nameEn);
      if (taken.has(name)) errors.nameEn = existing.some((c) => key(c.nameEn) === name) ? "clientExists" : "duplicateInFile";
      else {
        taken.add(name);
        inserts.push({ ...parsed.data, organizationId: ctx.organizationId });
      }
    }
    rows.push({ ...r, errors });
  }
  return { rows, valid: inserts.length, save: (tx) => tx.client.createMany({ data: inserts }) };
}

async function prepareSites(ctx: OrgContext, sheet: SheetRow[]): Promise<Prepared> {
  const db = tenantDb(ctx.organizationId);
  const [clients, sites] = await Promise.all([
    db.client.findMany({ where: { archivedAt: null }, select: { id: true, nameEn: true, nameAr: true } }),
    db.site.findMany({ where: { archivedAt: null }, select: { clientId: true, name: true } }),
  ]);
  const clientByName = new Map<string, string>();
  for (const c of clients) {
    clientByName.set(key(c.nameEn), c.id);
    if (c.nameAr) clientByName.set(key(c.nameAr), c.id);
  }
  const existing = new Set(sites.map((s) => `${s.clientId}:${key(s.name)}`));
  const inFile = new Set<string>();
  const rows: CheckedRow[] = [];
  const inserts: Prisma.SiteCreateManyInput[] = [];
  for (const r of sheet) {
    const parsed = siteFieldsSchema.safeParse(r.values);
    const errors = parsed.success ? {} : zodErrors(parsed.error);
    const clientName = r.values.clientName ?? "";
    const clientId = clientByName.get(key(clientName));
    if (!clientName) errors.clientName = "required";
    else if (!clientId) errors.clientName = "clientNotFound";
    if (parsed.success && clientId) {
      const k = `${clientId}:${key(parsed.data.name)}`;
      if (existing.has(k)) errors.name = "siteExists";
      else if (inFile.has(k)) errors.name = "duplicateInFile";
      else {
        inFile.add(k);
        inserts.push({ ...parsed.data, clientId, organizationId: ctx.organizationId });
      }
    }
    rows.push({ ...r, errors });
  }
  return { rows, valid: inserts.length, save: (tx) => tx.site.createMany({ data: inserts }) };
}

async function prepareWorkers(ctx: OrgContext, sheet: SheetRow[]): Promise<Prepared> {
  const db = tenantDb(ctx.organizationId);
  const [sites, workers] = await Promise.all([
    db.site.findMany({ where: { archivedAt: null }, select: { id: true, name: true, client: { select: { nameEn: true, nameAr: true } } } }),
    db.worker.findMany({ select: { iqamaHash: true } }),
  ]);
  const takenHashes = new Set(workers.map((w) => w.iqamaHash));
  const inFile = new Set<string>();
  const rows: CheckedRow[] = [];
  const inserts: Prisma.WorkerCreateManyInput[] = [];

  for (const r of sheet) {
    const parsed = workerFieldsSchema.safeParse(r.values);
    const errors = parsed.success ? {} : zodErrors(parsed.error);

    let siteId: string | null = null;
    const siteName = key(r.values.siteName ?? "");
    const clientName = key(r.values.clientName ?? "");
    if (siteName) {
      const matches = sites.filter(
        (s) => key(s.name) === siteName && (!clientName || key(s.client.nameEn) === clientName || key(s.client.nameAr ?? "") === clientName),
      );
      if (matches.length === 1) siteId = matches[0]!.id;
      else errors.siteName = matches.length === 0 ? "siteNotFound" : "siteAmbiguous";
    }

    if (parsed.success) {
      const hash = blindIndex(ctx.organizationId, parsed.data.iqamaNumber);
      if (takenHashes.has(hash)) errors.iqamaNumber = "iqamaTaken";
      else if (inFile.has(hash)) errors.iqamaNumber = "duplicateInFile";
      inFile.add(hash);
      if (Object.keys(errors).length === 0) {
        inserts.push({
          organizationId: ctx.organizationId,
          ...plainColumns(parsed.data),
          ...iqamaColumns(ctx.organizationId, parsed.data.iqamaNumber),
          ...passportColumns(parsed.data.passportNumber),
          siteId,
        });
      }
    }
    rows.push({ ...r, errors });
  }
  return { rows, valid: inserts.length, save: (tx) => tx.worker.createMany({ data: inserts }) };
}

const PREPARE: Record<ImportType, (ctx: OrgContext, sheet: SheetRow[]) => Promise<Prepared>> = {
  clients: prepareClients,
  sites: prepareSites,
  workers: prepareWorkers,
};

/** Masks sensitive values (Iqama, passport) for the preview shown in the browser. */
function maskRow(type: ImportType, values: Record<string, string>): Record<string, string> {
  const out = { ...values };
  for (const col of COLUMNS[type]) {
    const v = out[col.key];
    if (col.sensitive && v) out[col.key] = v.length > 4 ? `•••• ${v.slice(-4)}` : "••••";
  }
  return out;
}

export interface ImportPreview {
  rows: CheckedRow[];
  validCount: number;
  errorCount: number;
}

/** Checks every row without saving anything. */
export async function previewImport(ctx: OrgContext, type: ImportType, sheet: SheetRow[]): Promise<ImportPreview> {
  assertCan(ctx, "data.write");
  const { rows } = await PREPARE[type](ctx, sheet);
  const errorCount = rows.filter((r) => Object.keys(r.errors).length > 0).length;
  return {
    rows: rows.map((r) => ({ ...r, values: maskRow(type, r.values) })),
    validCount: rows.length - errorCount,
    errorCount,
  };
}

/**
 * Re-checks the rows (the file is sent again, nothing from the browser is trusted)
 * and saves the valid ones in one transaction. Rows with errors are skipped.
 */
export async function commitImport(ctx: OrgContext, type: ImportType, sheet: SheetRow[]) {
  assertCan(ctx, "data.write");
  const { rows, valid, save } = await PREPARE[type](ctx, sheet);
  const skipped = rows.length - valid;
  await tenantTransaction(
    ctx.organizationId,
    async (tx) => {
      if (valid > 0) await save(tx);
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: `${type}.imported`,
        entityType: "Import",
        metadata: { imported: valid, skipped },
      });
    },
    { timeout: 60_000 },
  );
  return { imported: valid, skipped };
}
