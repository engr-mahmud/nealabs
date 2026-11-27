"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionError, parseForm, type ActionState } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { formId } from "@/features/master-data/actions-helpers";
import { requireOrgAction } from "@/features/organizations/current";
import { categorySchema, entrySchema, refundSchema, voidSchema } from "./schemas";
import { createCategory, createEntry, recordInvoiceRefund, setCategoryArchived, updateCategory, updateEntry, voidEntry } from "./service";

/** Creates an income or expense (back to the list) or saves changes to one (back to it). */
export async function saveEntryAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(entrySchema, formData);
  if (error) return error;
  const id = formId(formData);
  try {
    const ctx = await requireOrgAction();
    if (id) await updateEntry(ctx, id, data);
    else await createEntry(ctx, data);
  } catch (e) {
    return actionError(e, formData);
  }
  revalidatePath("/app/finance", "layout");
  redirect(id ? `/app/finance/${id}?done=saved` : "/app/finance?done=saved");
}

export async function voidEntryAction(formData: FormData) {
  const id = formId(formData);
  const { data } = await parseForm(voidSchema, formData);
  const entry = await voidEntry(await requireOrgAction(), id, data?.reason ?? null);
  revalidatePath("/app", "layout");
  redirect(entry.source === "INVOICE_REFUND" && entry.salesDocumentId ? `/app/sales/invoices/${entry.salesDocumentId}` : `/app/finance/${id}?done=voided`);
}

/** Adds a category, or renames one when an id is sent. */
export async function saveCategoryAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const id = formId(formData);
  const { data, error } = await parseForm(categorySchema, formData);
  if (error) return error;
  try {
    const ctx = await requireOrgAction();
    if (id) await updateCategory(ctx, id, data);
    else await createCategory(ctx, data);
  } catch (e) {
    return actionError(e, formData);
  }
  revalidatePath("/app/finance", "layout");
  redirect(id ? "/app/finance/categories?done=saved" : "/app/finance/categories?done=added");
}

export async function setCategoryArchivedAction(formData: FormData) {
  const archived = formData.get("archived") === "1";
  try {
    await setCategoryArchived(await requireOrgAction(), formId(formData), archived);
  } catch (e) {
    if (e instanceof AppError) redirect(`/app/finance/categories?error=${e.code}`);
    throw e;
  }
  revalidatePath("/app/finance", "layout");
  redirect("/app/finance/categories");
}

/** Money paid back to a client on a credited invoice. */
export async function recordRefundAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(refundSchema, formData);
  if (error) return error;
  const id = formId(formData);
  try {
    await recordInvoiceRefund(await requireOrgAction(), id, data);
  } catch (e) {
    return actionError(e, formData);
  }
  revalidatePath("/app", "layout");
  redirect(`/app/sales/invoices/${id}?done=refund`);
}
