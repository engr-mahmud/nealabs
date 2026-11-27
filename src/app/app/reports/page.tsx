import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { requireOrgPage } from "@/features/organizations/current";

export const metadata: Metadata = { title: "Reports" };

const reports = [
  { key: "profit", href: "/app/finance/reports" },
  { key: "receivables", href: "/app/reports/receivables" },
  { key: "monthly", href: "/app/reports/monthly" },
  { key: "salaries", href: "/app/payroll?status=UNPAID" },
  { key: "expiring", href: "/app/workforce?expiry=soon" },
] as const;

export default async function ReportsPage() {
  await requireOrgPage();
  const t = await getTranslations("reports");
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {reports.map((r) => (
          <li key={r.key}>
            <Link href={r.href} className="flex h-full min-h-24 flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand focus-visible:border-brand">
              <span className="font-semibold text-slate-900">{t(`hub.${r.key}.title`)}</span>
              <span className="mt-1 text-sm text-slate-600">{t(`hub.${r.key}.body`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
