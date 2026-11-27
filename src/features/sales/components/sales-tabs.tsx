import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";
import { typeSlugs, type SalesTypeSlug } from "../status";

/** Quotations | Proformas | Invoices switch at the top of the sales pages. */
export async function SalesTabs({ current }: { current: SalesTypeSlug }) {
  const t = await getTranslations("sales");
  const slugs = [typeSlugs.QUOTATION, typeSlugs.PROFORMA, typeSlugs.INVOICE];
  return (
    <nav className="mb-5 inline-flex w-full rounded-xl bg-slate-100 p-1 sm:w-auto" aria-label={t("title")}>
      {slugs.map((s) => (
        <Link
          key={s}
          href={`/app/sales/${s}`}
          aria-current={s === current ? "page" : undefined}
          className={cn(
            "inline-flex min-h-10 flex-1 items-center justify-center rounded-lg px-4 text-sm font-medium whitespace-nowrap sm:flex-none",
            s === current ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
          )}
        >
          {t(`types.${s}.plural`)}
        </Link>
      ))}
    </nav>
  );
}
