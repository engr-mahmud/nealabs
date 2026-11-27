import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { requireOrgPage } from "@/features/organizations/current";
import { canWriteData } from "@/features/master-data/permissions";
import { param } from "@/features/master-data/list";
import { setCategoryArchivedAction } from "@/features/finance/actions";
import { CategoryForm } from "@/features/finance/components/category-forms";
import { FinanceTabs } from "@/features/finance/components/finance-tabs";
import { listCategories } from "@/features/finance/service";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await requireOrgPage();
  const sp = await searchParams;
  const [t, tc, te, locale, categories] = await Promise.all([getTranslations("finance"), getTranslations("common"), getTranslations("errors"), getLocale(), listCategories(ctx)]);
  const canWrite = canWriteData(ctx);
  const done = param(sp, "done");
  const error = param(sp, "error");
  const otherName = (c: { nameEn: string; nameAr: string | null }) => (locale === "ar" ? c.nameEn : c.nameAr);
  const mainName = (c: { nameEn: string; nameAr: string | null }) => (locale === "ar" && c.nameAr ? c.nameAr : c.nameEn);

  return (
    <>
      <FinanceTabs current="categories" />
      <PageHeader title={t("categories.title")} subtitle={t("categories.subtitle")} />
      {done === "added" ? <Alert tone="success" className="mb-4">{t("categories.added")}</Alert> : null}
      {done === "saved" ? <Alert tone="success" className="mb-4">{t("done.saved")}</Alert> : null}
      {error && te.has(error) ? <Alert tone="error" className="mb-4">{te(error)}</Alert> : null}

      <div className="space-y-4">
        {canWrite ? (
          <Card>
            <CardTitle className="mb-4 text-base">{t("categories.add")}</CardTitle>
            <CategoryForm />
          </Card>
        ) : null}
        {(["EXPENSE", "INCOME"] as const).map((kind) => (
          <Card key={kind} className="p-0 sm:p-0">
            <CardTitle className="px-5 pt-5 text-base sm:px-6">{t(kind === "INCOME" ? "categories.income" : "categories.expense")}</CardTitle>
            <ul className="mt-3 divide-y divide-slate-100">
              {categories
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <li key={c.id} className="px-5 py-3 sm:px-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                          <span className={c.archivedAt ? "text-slate-400" : undefined}>{mainName(c)}</span>
                          {c.locked ? <Badge tone="brand">{t("categories.locked")}</Badge> : null}
                          {c.archivedAt ? <Badge>{tc("archivedBadge")}</Badge> : null}
                        </p>
                        <p className="text-sm text-slate-500">
                          {otherName(c) ? `${otherName(c)} · ` : ""}
                          {t("categories.entries", { count: c._count.entries })}
                        </p>
                      </div>
                      {canWrite ? (
                        <div className="flex items-center gap-1">
                          <details className="group">
                            <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
                              {t("categories.rename")}
                            </summary>
                            <div className="absolute start-4 end-4 z-10 mt-2 rounded-xl border border-slate-200 bg-white p-4 shadow-lg sm:start-auto sm:end-auto sm:w-[28rem]">
                              <CategoryForm id={c.id} kind={c.kind} nameEn={c.nameEn} nameAr={c.nameAr} compact />
                            </div>
                          </details>
                          {c.locked ? null : (
                            <form action={setCategoryArchivedAction}>
                              <input type="hidden" name="id" value={c.id} />
                              <input type="hidden" name="archived" value={c.archivedAt ? "0" : "1"} />
                              <Button type="submit" variant="ghost" size="sm">
                                {c.archivedAt ? tc("restore") : tc("archive")}
                              </Button>
                            </form>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
