import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { PageHeader } from "@/components/layout/page-header";
import { removeMemberAction, revokeInvitationAction } from "@/features/organizations/actions";
import { InviteForm } from "@/features/organizations/components/invite-form";
import { requireOrgPage } from "@/features/organizations/current";
import { can } from "@/features/organizations/permissions";
import { listMembers, listPendingInvitations } from "@/features/organizations/service";

export const metadata: Metadata = { title: "Team" };

export default async function MembersPage() {
  const { ctx } = await requireOrgPage();
  const t = await getTranslations();
  const format = await getFormatter();
  const canManage = can(ctx.role, "members.manage") && !ctx.access.readOnly;
  const [members, invitations] = await Promise.all([listMembers(ctx), canManage ? listPendingInvitations(ctx) : Promise.resolve([])]);

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title={t("members.title")} subtitle={t("members.subtitle")} />
      <Card>
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">
                  {m.user.name} {m.user.id === ctx.userId ? <span className="text-sm font-normal text-slate-500">({t("members.you")})</span> : null}
                </p>
                <p className="truncate text-sm text-slate-500" dir="ltr">
                  {m.user.email}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={m.role === "OWNER" ? "brand" : "neutral"}>{t(`members.roles.${m.role}`)}</Badge>
                {canManage && m.user.id !== ctx.userId ? (
                  <form action={removeMemberAction}>
                    <input type="hidden" name="membershipId" value={m.id} />
                    <ConfirmSubmit
                      label={t("members.remove")}
                      confirmText={t("members.removeConfirm", { name: m.user.name })}
                      confirmLabel={t("members.remove")}
                      cancelLabel={t("common.cancel")}
                    />
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {canManage ? (
        <>
          <Card>
            <CardTitle className="mb-4">{t("members.invite.title")}</CardTitle>
            <InviteForm />
          </Card>
          {invitations.length > 0 ? (
            <Card>
              <CardTitle className="mb-2">{t("members.pending")}</CardTitle>
              <ul className="divide-y divide-slate-100">
                {invitations.map((inv) => (
                  <li key={inv.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-slate-900" dir="ltr">
                        {inv.email}
                      </p>
                      <p className="text-sm text-slate-500">
                        {t(`members.roles.${inv.role}`)} · {t("members.expires", { date: format.dateTime(inv.expiresAt, { dateStyle: "medium" }) })}
                      </p>
                    </div>
                    <form action={revokeInvitationAction}>
                      <input type="hidden" name="invitationId" value={inv.id} />
                      <button type="submit" className="min-h-10 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
                        {t("members.revoke")}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
