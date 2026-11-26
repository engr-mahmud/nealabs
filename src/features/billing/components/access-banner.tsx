import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { OrgAccess } from "../access";

/** Always shows trial days left or read-only state, with one clear next step. */
export async function AccessBanner({ access }: { access: OrgAccess }) {
  const t = await getTranslations("trial");
  if (access.state === "active") return null;

  if (access.state === "trialing") {
    return (
      <div className="border-b border-brand/20 bg-brand/5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm sm:px-6">
          <span className="text-slate-800">{t("banner", { days: access.trialDaysLeft ?? 0 })}</span>
          <Link href="/app/billing" className="font-medium text-brand hover:underline">
            {t("choosePlan")}
          </Link>
        </div>
      </div>
    );
  }

  const readOnly = access.state === "expired";
  return (
    <div role="status" className={readOnly ? "border-b border-amber-200 bg-amber-50" : "border-b border-red-200 bg-red-50"}>
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 text-sm sm:flex-row sm:items-center sm:px-6">
        <div className="flex-1">
          {readOnly ? (
            <>
              <p className="font-semibold text-amber-950">{t("readOnlyTitle")}</p>
              <p className="text-amber-900">{t("readOnlyBody")}</p>
            </>
          ) : (
            <p className="text-red-900">{t("pastDue")}</p>
          )}
        </div>
        <div className="flex gap-2">
          <a href="/api/export" className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3 font-medium text-slate-800 hover:bg-slate-50">
            {t("exportData")}
          </a>
          <Link href="/app/billing" className="inline-flex min-h-10 items-center rounded-lg bg-brand px-4 font-medium text-brand-foreground hover:bg-brand-hover">
            {t("choosePlan")}
          </Link>
        </div>
      </div>
    </div>
  );
}
