"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { actionError, formValues, parseForm, type ActionState } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { formId } from "@/features/master-data/actions-helpers";
import { requireOrgAction } from "@/features/organizations/current";
import { linesSchema, parseLinesJson, paymentSchema, salesDocSchema, type PaymentInput } from "./schemas";
import { addPayment, convertSalesDoc, createCreditNote, createSalesDoc, deleteDraft, deletePayment, issueTaxDocument, markSalesDocSent, updateSalesDoc } from "./service";
import { typeFromSlug, typeSlugs, type SalesType } from "./status";

function docPath(type: SalesType, id: string) {
  return `/app/sales/${typeSlugs[type]}/${id}`;
}

/** Line errors come back as "lines.<row>.<field>" (or "lines" for the list as a whole). */
async function parseLines(formData: FormData) {
  const result = linesSchema.safeParse(parseLinesJson(formData.get("lines")));
  if (result.success) return { lines: result.data, errors: null };
  const tv = await getTranslations("validation");
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length >= 2 ? `lines.${String(issue.path[0])}.${String(issue.path[1])}` : "lines";
    errors[key] ??= tv.has(issue.message) ? tv(issue.message) : tv("invalid");
  }
  return { lines: null, errors };
}

/** Creates a document (type from the form) or saves changes to a draft, then opens it. */
export async function saveSalesDocAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const type = typeFromSlug(String(formData.get("type") ?? ""));
  if (!type) return { ok: false, message: (await getTranslations("errors"))("generic") };
  const [{ data, error }, lines] = await Promise.all([parseForm(salesDocSchema, formData), parseLines(formData)]);
  if (error || lines.errors) {
    return { ok: false, fieldErrors: { ...error?.fieldErrors, ...lines.errors }, values: formValues(formData) };
  }
  const id = formId(formData);
  let targetId: string;
  try {
    const ctx = await requireOrgAction();
    const input = { ...data!, lines: lines.lines! };
    if (id) targetId = (await updateSalesDoc(ctx, id, input)).id;
    else if (type === "CREDIT_NOTE") targetId = (await createCreditNote(ctx, formId(formData, "invoiceId"), input)).id;
    else targetId = (await createSalesDoc(ctx, type, input)).id;
  } catch (e) {
    return actionError(e, formData);
  }
  revalidatePath("/app/sales", "layout");
  redirect(`${docPath(type, targetId)}?saved=1`);
}

/** The buttons on a document page: send, issue, convert, delete draft. */
export async function salesDocCommandAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const id = formId(formData);
  const command = String(formData.get("command") ?? "");
  const type = typeFromSlug(String(formData.get("type") ?? ""));
  let target: string;
  try {
    const ctx = await requireOrgAction();
    if (!type) throw new Error("Unknown document type");
    if (command === "send") {
      await markSalesDocSent(ctx, id);
      target = `${docPath(type, id)}?done=sent`;
    } else if (command === "issue") {
      await issueTaxDocument(ctx, id);
      target = `${docPath(type, id)}?done=issued`;
    } else if (command === "convert-PROFORMA" || command === "convert-INVOICE") {
      const to = command === "convert-PROFORMA" ? "PROFORMA" : "INVOICE";
      const doc = await convertSalesDoc(ctx, id, to);
      target = `${docPath(to, doc.id)}?done=converted`;
    } else if (command === "delete") {
      await deleteDraft(ctx, id);
      target = `/app/sales/${typeSlugs[type]}?done=deleted`;
    } else {
      throw new Error("Unknown command");
    }
  } catch (e) {
    return actionError(e);
  }
  revalidatePath("/app/sales", "layout");
  redirect(target);
}

export async function addPaymentAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(paymentSchema, formData);
  if (error) return error;
  const id = formId(formData);
  try {
    await addPayment(await requireOrgAction(), id, data as PaymentInput);
  } catch (e) {
    return actionError(e, formData);
  }
  revalidatePath("/app/sales", "layout");
  redirect(`${docPath("INVOICE", id)}?done=paid`);
}

export async function deletePaymentAction(formData: FormData) {
  let documentId: string;
  try {
    documentId = await deletePayment(await requireOrgAction(), formId(formData));
  } catch (e) {
    // Expected refusals (e.g. a refund depends on the payment) are shown on the invoice page.
    const invoiceId = formId(formData, "documentId");
    if (e instanceof AppError && invoiceId) redirect(`${docPath("INVOICE", invoiceId)}?error=${e.code}`);
    throw e;
  }
  revalidatePath("/app", "layout");
  redirect(`${docPath("INVOICE", documentId)}?done=paymentDeleted`);
}
