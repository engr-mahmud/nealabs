import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * One dashboard card: a title, one big number, a short line of context and one link
 * to the place where the user acts on it. `attention` adds a warm border.
 */
export function StatCard({
  title,
  value,
  valueClassName,
  sub,
  children,
  action,
  attention = false,
}: {
  title: string;
  value?: ReactNode;
  valueClassName?: string;
  sub?: ReactNode;
  children?: ReactNode;
  action: { href: string; label: string };
  attention?: boolean;
}) {
  return (
    <section className={cn("flex flex-col rounded-xl border bg-white p-5 shadow-sm", attention ? "border-amber-300" : "border-slate-200")}>
      <h2 className="text-sm font-medium text-slate-600">{title}</h2>
      {value !== undefined ? <p className={cn("mt-1 text-3xl font-semibold tabular-nums", valueClassName ?? "text-slate-900")}>{value}</p> : null}
      {sub ? <div className="mt-1 text-sm text-slate-600">{sub}</div> : null}
      {children ? <div className="mt-3">{children}</div> : null}
      <div className="mt-auto pt-3">
        <Link href={action.href} className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline">
          {action.label} <span aria-hidden className="ms-1 inline-block rtl:rotate-180">→</span>
        </Link>
      </div>
    </section>
  );
}
