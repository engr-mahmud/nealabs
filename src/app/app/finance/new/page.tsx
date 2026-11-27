import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/cn";
import { toDateInput } from "@/lib/parse";
import { requireOrgPage } from "@/features/organizations/current";
import { canWriteData } from "@/features/master-data/permissions";
import { param } from "@/features/master-data/list";
import { todayInRiyadh } from "@/features/master-data/expiry";
import { EntryForm } from "@/features/finance/components/entry-form";
import { entryFormOptions } from "@/features/finance/service";

export const metadata: Metadata = { title: "New entry" };

export default async function NewEntryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await requireOrgPage();
  if (!canWriteData(ctx)) redirect("/app/finance");
  const sp = await searchParams;
  const kind = param(sp, "kind") === "INCOME" ? "INCOME" : "EXPENSE";
  const [t, options] = await Promise.all([getTranslations("finance"), entryFormOptions(ctx)]);
  const site = param(sp, "site");
  return (
    <div className="max-w-3xl">
      <Link href="/app/finance" className="mb-2 inline-flex min-h-11 items-center text-sm font-medium text-slate-600 hover:text-slate-900">
        <span aria-hidden className="me-1 rtl:rotate-180">←</span> {t("tabs.transactions")}
      </Link>
      <PageHeader title={t(kind === "INCOME" ? "newIncome" : "newExpense")} />
      <nav className="mb-4 inline-flex w-full rounded-xl bg-slate-100 p-1 sm:w-auto" aria-label={t("fields.categoryId")}>
        {(["EXPENSE", "INCOME"] as const).map((k) => (
          <Link
            key={k}
            href={`/app/finance/new?kind=${k}`}
            aria-current={k === kind ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 flex-1 items-center justify-center rounded-lg px-5 text-sm font-medium sm:flex-none",
              k === kind ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
            )}
          >
            {t(`kinds.${k}`)}
          </Link>
        ))}
      </nav>
      <EntryForm key={kind} kind={kind} values={{ date: toDateInput(todayInRiyadh()), siteId: options.sites.some((s) => s.id === site) ? site : "" }} options={options} />
    </div>
  );
}
