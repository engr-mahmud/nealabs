"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { actionError, parseForm, type ActionState } from "@/lib/action";
import { rateLimit } from "@/lib/rate-limit";
import { requireOrgAction } from "@/features/organizations/current";
import { formId } from "@/features/master-data/actions-helpers";
import { workerCreateSchema, workerUpdateSchema } from "./schemas";
import { createWorker, revealWorkerDocument, setWorkerArchived, updateWorker } from "./service";

const SENSITIVE = ["iqamaNumber", "passportNumber"];

export async function saveWorkerAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const id = formId(formData);
  try {
    if (id) {
      const { data, error } = await parseForm(workerUpdateSchema, formData);
      // Never echo Iqama or passport numbers back to the browser on the edit page.
      if (error) return { ...error, values: omit(error.values, SENSITIVE) };
      await updateWorker(await requireOrgAction(), id, data);
    } else {
      const { data, error } = await parseForm(workerCreateSchema, formData);
      if (error) return error;
      await createWorker(await requireOrgAction(), data);
    }
  } catch (e) {
    const state = await actionError(e, formData);
    return id ? { ...state, values: omit(state.values, SENSITIVE) } : state;
  }
  revalidatePath("/app", "layout");
  redirect(formData.get("addAnother") === "1" ? "/app/workforce/new?saved=1" : "/app/workforce?saved=1");
}

function omit(values: Record<string, string> | undefined, keys: string[]) {
  if (!values) return values;
  return Object.fromEntries(Object.entries(values).filter(([k]) => !keys.includes(k)));
}

export async function setWorkerArchivedAction(formData: FormData) {
  const id = formId(formData);
  const archived = formData.get("archived") === "1";
  await setWorkerArchived(await requireOrgAction(), id, archived);
  revalidatePath("/app", "layout");
  redirect(archived ? "/app/workforce" : `/app/workforce/${id}`);
}

/** Returns a full Iqama or passport number for one worker. Rate limited and audited. */
export async function revealDocumentAction(workerId: string, document: "iqama" | "passport"): Promise<{ value: string | null; error?: string }> {
  try {
    const ctx = await requireOrgAction();
    await rateLimit(`reveal:user:${ctx.userId}`, 60, 60 * 60);
    const doc = document === "passport" ? "passport" : "iqama";
    return { value: await revealWorkerDocument(ctx, String(workerId).slice(0, 40), doc) };
  } catch (e) {
    const state = await actionError(e);
    return { value: null, error: state.message ?? (await getTranslations("errors"))("generic") };
  }
}
