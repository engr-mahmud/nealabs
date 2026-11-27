import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";

const tabs = [
  { key: "sheets", href: "/app/payroll" },
  { key: "settings", href: "/app/payroll/settings" },
] as const;

/** Salary sheets | Payroll rules switch at the top of the salary pages. */
export async function PayrollTabs({ current }: { current: (typeof tabs)[number]["key"] }) {
  const t = await getTranslations("payroll");
  return (
    <nav className="mb-5 inline-flex w-full overflow-x-auto rounded-xl bg-slate-100 p-1 sm:w-auto" aria-label={t("title")}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === current ? "page" : undefined}
          className={cn(
            "inline-flex min-h-10 flex-1 items-center justify-center rounded-lg px-4 text-sm font-medium whitespace-nowrap sm:flex-none",
            tab.key === current ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
          )}
        >
          {t(`tabs.${tab.key}`)}
        </Link>
      ))}
    </nav>
  );
}
