import { getLocale, getTranslations } from "next-intl/server";
import { switchOrganizationAction } from "../actions";
import { OrgAvatar } from "./org-avatar";

interface Org {
  id: string;
  nameEn: string;
  nameAr: string | null;
}

export function orgDisplayName(org: { nameEn: string; nameAr: string | null }, locale: string) {
  return locale === "ar" && org.nameAr ? org.nameAr : org.nameEn;
}

/** Works without JavaScript: a disclosure with one form button per company. */
export async function OrgSwitcher({ current, orgs, logoVersion }: { current: Org; orgs: Org[]; logoVersion: string | null }) {
  const locale = await getLocale();
  const t = await getTranslations("nav");
  const name = orgDisplayName(current, locale);
  return (
    <details className="group relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
        <OrgAvatar orgId={current.id} name={name} logoVersion={logoVersion} />
        <span className="max-w-[40vw] truncate font-semibold text-slate-900 sm:max-w-xs">{name}</span>
        <svg aria-hidden viewBox="0 0 20 20" className="size-4 text-slate-500 transition group-open:rotate-180">
          <path fill="currentColor" d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
        </svg>
        <span className="sr-only">{t("switchOrganization")}</span>
      </summary>
      <div className="absolute start-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
        <p className="px-2 pb-1 text-xs font-medium text-slate-500">{t("switchOrganization")}</p>
        <ul className="space-y-0.5">
          {orgs.map((org) => (
            <li key={org.id}>
              <form action={switchOrganizationAction}>
                <input type="hidden" name="organizationId" value={org.id} />
                <button
                  type="submit"
                  aria-current={org.id === current.id ? "true" : undefined}
                  className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-start text-sm hover:bg-slate-100 aria-[current]:font-semibold"
                >
                  <span className="truncate">{orgDisplayName(org, locale)}</span>
                  {org.id === current.id ? <span className="text-brand" aria-hidden>✓</span> : null}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <div className="mt-1 border-t border-slate-100 pt-1">
          <a href="/app/organizations/new" className="flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-brand hover:bg-slate-100">
            + {t("newOrganization")}
          </a>
        </div>
      </div>
    </details>
  );
}
