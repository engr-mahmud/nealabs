"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { actionError, parseForm, type ActionState } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { formId } from "@/features/master-data/actions-helpers";
import { requireOrgAction } from "@/features/organizations/current";
import { approveSchema, lineInputSchema, notesSchema, periodSchema, settingsSchema } from "./schemas";
import {
  addMissingWorkers,
  approveSheet,
  createSheetForActiveWorkers,
  deleteDraftSheet,
  importTimesheet,
  previewTimesheet,
  refreshDraft,
  removeLine,
  reopenSheet,
  savePayrollSettings,
  updateLine,
  updateSheetNotes,
  type CheckedTimesheetRow,
  type TimesheetTarget,
} from "./service";
import { readTimesheet } from "./timesheet";

export interface TimesheetState {
  ok: boolean;
  message?: string;
  stage: "upload" | "preview";
  rows?: CheckedTimesheetRow[];
  validCount?: number;
  errorCount?: number;
  totalNet?: number;
}

function sheetPath(id: string, done?: string) {
  return `/app/payroll/${id}${done ? `?done=${done}` : ""}`;
}

async function readTarget(formData: FormData): Promise<TimesheetTarget> {
  const sheetId = formId(formData, "sheetId") || null;
  if (sheetId) return { year: 0, month: 0, siteId: null, sheetId };
  const period = periodSchema.safeParse(formData.get("month") ?? "");
  if (!period.success) throw new AppError("chooseMonth");
  return { ...period.data, siteId: formId(formData, "siteId") || null, sheetId: null };
}

/**
 * Step 2 (check, with row-level errors) and step 3 (save) of the timesheet upload.
 * The file is sent again for the save step, so nothing the browser sends back is trusted.
 */
export async function timesheetAction(_prev: TimesheetState | null, formData: FormData): Promise<TimesheetState> {
  const commit = formData.get("mode") === "commit";
  let result: { sheetId: string; imported: number; skipped: number } | null = null;
  try {
    const ctx = await requireOrgAction();
    await rateLimit(`payroll-import:org:${ctx.organizationId}`, 60, 60 * 60);
    const target = await readTarget(formData);
    const file = formData.get("file");
    const rows = await readTimesheet(file instanceof File ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array());
    if (!commit) {
      const preview = await previewTimesheet(ctx, target, rows);
      const tv = await getTranslations("validation");
      return {
        ok: true,
        stage: "preview",
        validCount: preview.validCount,
        errorCount: preview.errorCount,
        totalNet: preview.totalNet,
        rows: preview.rows.map((r) => ({ ...r, errors: Object.fromEntries(Object.entries(r.errors).map(([k, code]) => [k, tv.has(code) ? tv(code) : tv("invalid")])) })),
      };
    }
    result = await importTimesheet(ctx, target, rows);
  } catch (e) {
    const state = await actionError(e);
    return { ok: false, stage: "upload", message: state.message };
  }
  revalidatePath("/app/payroll", "layout");
  redirect(`/app/payroll/${result.sheetId}?done=imported&n=${result.imported}&skipped=${result.skipped}`);
}

/** Start a sheet with all active workers (no Excel), then fill it in on the page. */
export async function createSheetAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  let id: string;
  try {
    const target = await readTarget(formData);
    id = await createSheetForActiveWorkers(await requireOrgAction(), target);
  } catch (e) {
    return actionError(e, formData);
  }
  revalidatePath("/app/payroll", "layout");
  redirect(sheetPath(id, "created"));
}

export async function updateLineAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(lineInputSchema, formData);
  if (error) return error;
  try {
    const { sheetId } = await updateLine(await requireOrgAction(), formId(formData), data);
    revalidatePath(sheetPath(sheetId));
  } catch (e) {
    return actionError(e, formData);
  }
  const t = await getTranslations("payroll");
  return { ok: true, message: t("lineSaved") };
}

/** Runs a simple sheet action and returns to the sheet, with ?error= for expected problems. */
async function onSheet(formData: FormData, run: (id: string) => Promise<string | void>, done: string) {
  const id = formId(formData, "sheetId");
  let target = sheetPath(id, done);
  try {
    const next = await run(id);
    if (next) target = next;
  } catch (e) {
    if (e instanceof AppError) redirect(`/app/payroll/${id}?error=${e.code}`);
    throw e;
  }
  revalidatePath("/app", "layout");
  redirect(target);
}

export async function removeLineAction(formData: FormData) {
  await onSheet(formData, async () => void (await removeLine(await requireOrgAction(), formId(formData))), "removed");
}

export async function addMissingAction(formData: FormData) {
  await onSheet(formData, async (id) => `${sheetPath(id)}?done=added&n=${await addMissingWorkers(await requireOrgAction(), id)}`, "added");
}

export async function refreshDraftAction(formData: FormData) {
  await onSheet(formData, async (id) => void (await refreshDraft(await requireOrgAction(), id)), "refreshed");
}

export async function reopenAction(formData: FormData) {
  await onSheet(formData, async (id) => void (await reopenSheet(await requireOrgAction(), id)), "reopened");
}

export async function deleteSheetAction(formData: FormData) {
  await onSheet(
    formData,
    async (id) => {
      await deleteDraftSheet(await requireOrgAction(), id);
      return "/app/payroll?done=deleted";
    },
    "deleted",
  );
}

export async function approveAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(approveSchema, formData);
  if (error) return error;
  const id = formId(formData, "sheetId");
  try {
    await approveSheet(await requireOrgAction(), id, data.payDate);
  } catch (e) {
    return actionError(e, formData);
  }
  revalidatePath("/app", "layout");
  redirect(sheetPath(id, "approved"));
}

export async function saveNotesAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(notesSchema, formData);
  if (error) return error;
  const id = formId(formData, "sheetId");
  try {
    await updateSheetNotes(await requireOrgAction(), id, data.notes ?? null);
  } catch (e) {
    return actionError(e, formData);
  }
  revalidatePath(sheetPath(id));
  const t = await getTranslations("payroll");
  return { ok: true, message: t("notesSaved") };
}

export async function saveSettingsAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(settingsSchema, formData);
  if (error) return error;
  try {
    await savePayrollSettings(await requireOrgAction(), data);
  } catch (e) {
    return actionError(e, formData);
  }
  revalidatePath("/app/payroll", "layout");
  redirect("/app/payroll/settings?done=saved");
}
