"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { actionError, parseForm, type ActionState } from "@/lib/action";
import { env } from "@/lib/env";
import { emailLayout, sendEmail } from "@/lib/email";
import { AppError, ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { localeDir, isLocale } from "@/i18n/config";
import { getSession } from "@/features/auth/session";
import { loadOrgContext } from "./context";
import { requireOrgAction } from "./current";
import { companyBankSchema, companyLegalSchema, companyNameSchema, inviteSchema, organizationSchema } from "./schemas";
import {
  acceptInvitation,
  completeSetup,
  createInvitation,
  createOrganization,
  removeMember,
  removeOrganizationLogo,
  revokeInvitation,
  setOrganizationLogo,
  updateOrganization,
} from "./service";

async function requireSessionAction() {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

async function readLogo(formData: FormData): Promise<Uint8Array | null> {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return null;
  return new Uint8Array(await file.arrayBuffer());
}

/** Onboarding step 1 and "Add another company": creates the organization and starts the trial. */
export async function createOrganizationAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(companyNameSchema, formData);
  if (error) return error;
  try {
    const session = await requireSessionAction();
    await rateLimit(`org-create:user:${session.userId}`, 10, 24 * 60 * 60);
    const org = await createOrganization(session.userId, data);
    await prisma.session.update({ where: { id: session.id }, data: { activeOrganizationId: org.id } });
  } catch (e) {
    return actionError(e, formData);
  }
  redirect("/onboarding?step=2");
}

export async function saveLegalStepAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(companyLegalSchema, formData);
  if (error) return error;
  try {
    await updateOrganization(await requireOrgAction(), data);
  } catch (e) {
    return actionError(e, formData);
  }
  redirect("/onboarding?step=3");
}

export async function saveFinalStepAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(companyBankSchema, formData);
  if (error) return error;
  try {
    const ctx = await requireOrgAction();
    const logo = await readLogo(formData);
    if (logo) await setOrganizationLogo(ctx, logo);
    await updateOrganization(ctx, data);
    await completeSetup(ctx);
  } catch (e) {
    return actionError(e, formData);
  }
  redirect("/app");
}

export async function skipSetupAction() {
  try {
    await completeSetup(await requireOrgAction());
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
  }
  redirect("/app");
}

export async function updateOrganizationAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(organizationSchema, formData);
  if (error) return error;
  try {
    await updateOrganization(await requireOrgAction(), data);
  } catch (e) {
    return actionError(e, formData);
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: (await getTranslations("common"))("saved") };
}

export async function uploadLogoAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  try {
    const logo = await readLogo(formData);
    if (!logo) throw new AppError("logoInvalidType");
    await setOrganizationLogo(await requireOrgAction(), logo);
  } catch (e) {
    return actionError(e);
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: (await getTranslations("common"))("saved") };
}

export async function removeLogoAction() {
  await removeOrganizationLogo(await requireOrgAction());
  revalidatePath("/app", "layout");
}

export async function switchOrganizationAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const organizationId = String(formData.get("organizationId") ?? "");
  // Membership is verified server-side; the submitted id is only a choice.
  const ctx = organizationId ? await loadOrgContext(session.userId, organizationId) : null;
  if (!ctx) throw new ForbiddenError();
  await prisma.session.update({ where: { id: session.id }, data: { activeOrganizationId: ctx.organizationId } });
  revalidatePath("/app", "layout");
  redirect("/app");
}

export async function inviteMemberAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(inviteSchema, formData);
  if (error) return error;
  try {
    const ctx = await requireOrgAction();
    await rateLimit(`invite:org:${ctx.organizationId}`, 20, 24 * 60 * 60);
    const token = await createInvitation(ctx, data);
    const [org, inviter] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { nameEn: true, nameAr: true } }),
      prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { name: true, locale: true } }),
    ]);
    const locale = isLocale(inviter.locale) ? inviter.locale : "en";
    const t = await getTranslations({ locale, namespace: "email.invite" });
    const tRoles = await getTranslations({ locale, namespace: "members.roles" });
    const orgName = locale === "ar" && org.nameAr ? org.nameAr : org.nameEn;
    const vars = { inviter: inviter.name, org: orgName, role: tRoles(data.role) };
    const url = `${env().APP_URL}/invite/${encodeURIComponent(token)}`;
    const body = t("body", vars);
    await sendEmail({
      to: data.email,
      subject: t("subject", vars),
      text: `${body}\n\n${url}\n\n${t("footer")}`,
      html: emailLayout({ dir: localeDir(locale), heading: t("heading", vars), body, cta: { label: t("cta"), url }, footer: t("footer") }),
    });
  } catch (e) {
    return actionError(e, formData);
  }
  revalidatePath("/app/settings/members");
  return { ok: true, message: (await getTranslations("members.invite"))("sent", { email: data.email }) };
}

export async function revokeInvitationAction(formData: FormData) {
  await revokeInvitation(await requireOrgAction(), String(formData.get("invitationId") ?? ""));
  revalidatePath("/app/settings/members");
}

export async function removeMemberAction(formData: FormData) {
  await removeMember(await requireOrgAction(), String(formData.get("membershipId") ?? ""));
  revalidatePath("/app/settings/members");
}

export async function acceptInvitationAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSessionAction();
    const organizationId = await acceptInvitation(session.user, String(formData.get("token") ?? ""));
    await prisma.session.update({ where: { id: session.id }, data: { activeOrganizationId: organizationId } });
  } catch (e) {
    return actionError(e);
  }
  redirect("/app");
}
