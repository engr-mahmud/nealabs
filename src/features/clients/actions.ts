"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionError, parseForm, type ActionState } from "@/lib/action";
import { requireOrgAction } from "@/features/organizations/current";
import { formId } from "@/features/master-data/actions-helpers";
import { clientSchema } from "./schemas";
import { createClient, setClientArchived, updateClient } from "./service";

/** Creates a client (then opens it, so sites can be added) or saves changes to one. */
export async function saveClientAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(clientSchema, formData);
  if (error) return error;
  const id = formId(formData);
  let targetId: string;
  try {
    const ctx = await requireOrgAction();
    targetId = id ? (await updateClient(ctx, id, data)).id : (await createClient(ctx, data)).id;
  } catch (e) {
    return actionError(e, formData);
  }
  revalidatePath("/app/clients");
  redirect(`/app/clients/${targetId}?saved=1`);
}

export async function setClientArchivedAction(formData: FormData) {
  const id = formId(formData);
  const archived = formData.get("archived") === "1";
  await setClientArchived(await requireOrgAction(), id, archived);
  revalidatePath("/app", "layout");
  redirect(archived ? "/app/clients" : `/app/clients/${id}`);
}
