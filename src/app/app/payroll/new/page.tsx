import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { NotFoundError } from "@/lib/errors";
import { requireOrgPage } from "@/features/organizations/current";
import { canWriteData } from "@/features/master-data/permissions";
import { param } from "@/features/master-data/list";
import { todayInRiyadh } from "@/features/master-data/expiry";
import { periodKey } from "@/features/payroll/calc";
import { monthLabel } from "@/features/payroll/documents";
import { TimesheetWizard } from "@/features/payroll/components/timesheet-wizard";
import { getSheet, siteOptions } from "@/features/payroll/service";

export const metadata: Metadata = { title: "New salary sheet" };

export default async function NewSheetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await requireOrgPage();
  if (!canWriteData(ctx)) redirect("/app/payroll");
  const sheetId = param(await searchParams, "sheet");
  const [t, locale, sites] = await Promise.all([getTranslations("payroll"), getLocale(), siteOptions(ctx)]);
  const lang = locale === "ar" ? "ar" : "en";
  const name = (c: { nameEn: string; nameAr: string | null }) => (lang === "ar" && c.nameAr ? c.nameAr : c.nameEn);

  let sheet: { id: string; month: string; label: string } | null = null;
  if (sheetId) {
    const s = await getSheet(ctx, sheetId).catch((e) => {
      if (e instanceof NotFoundError) notFound();
      throw e;
    });
    if (s.status !== "DRAFT") redirect(`/app/payroll/${s.id}`);
    sheet = { id: s.id, month: periodKey(s.year, s.month), label: `${monthLabel(s.year, s.month, lang)} · ${s.site?.name ?? t("allSites")}` };
  }
  const today = todayInRiyadh();
  const defaultMonth = periodKey(today.getUTCFullYear(), today.getUTCMonth() + 1);

  return (
    <div className="max-w-5xl">
      <Link href={sheet ? `/app/payroll/${sheet.id}` : "/app/payroll"} className="mb-2 inline-flex min-h-11 items-center text-sm font-medium text-slate-600 hover:text-slate-900">
        <span aria-hidden className="me-1 rtl:rotate-180">←</span> {sheet ? sheet.label : t("title")}
      </Link>
      <PageHeader title={sheet ? t("wizard.replaceTitle") : t("newSheet")} subtitle={t("wizard.subtitle")} />
      <TimesheetWizard defaultMonth={defaultMonth} sheet={sheet} sites={sites.map((s) => ({ id: s.id, label: `${s.name} · ${name(s.client)}` }))} />
    </div>
  );
}
