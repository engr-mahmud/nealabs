import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { brand } from "@/config/brand";
import { AppNav } from "@/components/layout/app-nav";
import { LanguageSwitch } from "@/components/layout/language-switch";
import { signOutAction } from "@/features/auth/actions";
import { AccessBanner } from "@/features/billing/components/access-banner";
import { OrgSwitcher } from "@/features/organizations/components/org-switcher";
import { requireOrgPage } from "@/features/organizations/current";
import { getOrganization, listUserOrganizations } from "@/features/organizations/service";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, ctx } = await requireOrgPage();
  const [org, orgs, t] = await Promise.all([getOrganization(ctx), listUserOrganizations(user.id), getTranslations()]);

  const nav = [
    { href: "/app", label: t("nav.dashboard") },
    { href: "/app/settings/organization", label: t("nav.organization") },
    { href: "/app/settings/members", label: t("nav.members") },
    { href: "/app/billing", label: t("nav.billing") },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2 sm:px-6">
          <OrgSwitcher current={org} orgs={orgs} logoVersion={org.logo?.updatedAt.toISOString() ?? null} />
          <div className="flex items-center gap-1">
            <LanguageSwitch />
            <details className="relative">
              <summary className="flex min-h-10 cursor-pointer list-none items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
                <span className="sr-only">{t("common.account")}: </span>
                <span aria-hidden className="inline-flex size-8 items-center justify-center rounded-full bg-slate-200 text-slate-800">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </summary>
              <div className="absolute end-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                <div className="px-2 py-1.5">
                  <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
                  <p className="truncate text-xs text-slate-500" dir="ltr">
                    {user.email}
                  </p>
                </div>
                <form action={signOutAction} className="border-t border-slate-100 pt-1">
                  <button type="submit" className="flex min-h-11 w-full items-center rounded-lg px-2 text-start text-sm text-slate-700 hover:bg-slate-100">
                    {t("common.signOut")}
                  </button>
                </form>
              </div>
            </details>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-2 sm:px-4">
          <AppNav items={nav} />
        </div>
      </header>
      <AccessBanner access={ctx.access} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="py-6">
        <p className="text-center text-xs text-slate-400">{t("common.poweredBy", { brand: brand.umbrellaName })}</p>
      </footer>
    </div>
  );
}
