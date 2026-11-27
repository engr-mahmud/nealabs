"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { actionError } from "@/lib/action";
import { rateLimit } from "@/lib/rate-limit";
import { requireOrgAction } from "@/features/organizations/current";
import { assertCan } from "@/features/organizations/context";
import { isImportType, type ImportType } from "./definitions";
import { readSheet } from "./excel";
import { commitImport, previewImport, type CheckedRow } from "./service";

export interface ImportState {
  ok: boolean;
  message?: string;
  stage: "upload" | "preview" | "done";
  rows?: CheckedRow[];
  validCount?: number;
  errorCount?: number;
  imported?: number;
  skipped?: number;
}

const PATHS: Record<ImportType, string> = { clients: "/app/clients", sites: "/app/sites", workers: "/app/workforce" };

/**
 * Step 2 (preview) and step 3 (save) of an Excel import. The file is uploaded
 * again for the save step, so nothing the browser sends back is trusted.
 */
export async function importAction(_prev: ImportState | null, formData: FormData): Promise<ImportState> {
  const type = formData.get("type");
  const commit = formData.get("mode") === "commit";
  try {
    if (!isImportType(type)) throw new Error("Unknown import type");
    const ctx = await requireOrgAction();
    assertCan(ctx, "data.write");
    await rateLimit(`import:org:${ctx.organizationId}`, 60, 60 * 60);
    const file = formData.get("file");
    const bytes = file instanceof File ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array();
    const sheet = await readSheet(type, bytes);
    const tv = await getTranslations("validation");
    const translate = (rows: CheckedRow[]) =>
      rows.map((r) => ({ ...r, errors: Object.fromEntries(Object.entries(r.errors).map(([k, code]) => [k, tv.has(code) ? tv(code) : tv("invalid")])) }));

    if (!commit) {
      const preview = await previewImport(ctx, type, sheet);
      return { ok: true, stage: "preview", rows: translate(preview.rows), validCount: preview.validCount, errorCount: preview.errorCount };
    }
    const result = await commitImport(ctx, type, sheet);
    revalidatePath(PATHS[type]);
    revalidatePath("/app");
    return { ok: true, stage: "done", ...result };
  } catch (e) {
    const state = await actionError(e);
    return { ok: false, stage: "upload", message: state.message };
  }
}
