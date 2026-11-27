"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionError, parseForm, type ActionState } from "@/lib/action";
import { requireOrgAction } from "@/features/organizations/current";
import { formId, safeReturnPath } from "@/features/master-data/actions-helpers";
import { siteSchema } from "./schemas";
import { createSite, setSiteArchived, updateSite } from "./service";

export async function saveSiteAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(siteSchema, formData);
  if (error) return error;
  const id = formId(formData);
  try {
    const ctx = await requireOrgAction();
    if (id) await updateSite(ctx, id, data);
    else await createSite(ctx, data);
  } catch (e) {
    return actionError(e, formData);
  }
  revalidatePath("/app", "layout");
  redirect(safeReturnPath(formData.get("returnTo"), "/app/sites"));
}

export async function setSiteArchivedAction(formData: FormData) {
  const id = formId(formData);
  const archived = formData.get("archived") === "1";
  await setSiteArchived(await requireOrgAction(), id, archived);
  revalidatePath("/app", "layout");
  redirect(archived ? "/app/sites" : `/app/sites/${id}`);
}
