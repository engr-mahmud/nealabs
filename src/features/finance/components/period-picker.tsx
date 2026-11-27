import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";
import { toDateInput } from "@/lib/parse";
import { periodPresets, type Period } from "../period";

/**
 * Period presets as links plus a custom from/to range (plain GET form, works without JavaScript).
 * `keep` holds other URL parameters to carry along (filters).
 */
export async function PeriodPicker({ basePath, period, keep = {} }: { basePath: string; period: Period; keep?: Record<string, string> }) {
  const t = await getTranslations("finance.reports");
  const href = (p: string) => {
    const s = new URLSearchParams({ ...keep, period: p }).toString();
    return `${basePath}?${s}`;
  };
  const input =
    "block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none";
  return (
    <div className="flex flex-wrap gap-1 text-sm" role="group" aria-label={t("period")}>
      {periodPresets.map((p) => (
        <Link
          key={p}
          href={href(p)}
          aria-current={period.preset === p ? "true" : undefined}
          className={cn("inline-flex min-h-9 items-center rounded-full px-3 font-medium", period.preset === p ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}
        >
          {t(`presets.${p}`)}
        </Link>
      ))}
      <details className="group open:basis-full" open={period.preset === "custom"}>
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-full px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 group-open:bg-slate-900 group-open:text-white [&::-webkit-details-marker]:hidden">
          {t("presets.custom")}
        </summary>
        <form method="get" action={basePath} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          {Object.entries(keep).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <label className="space-y-1 sm:w-44">
            <span className="block text-sm text-slate-700">{t("from")}</span>
            <input type="date" name="from" dir="ltr" defaultValue={toDateInput(period.from)} className={input} />
          </label>
          <label className="space-y-1 sm:w-44">
            <span className="block text-sm text-slate-700">{t("to")}</span>
            <input type="date" name="to" dir="ltr" defaultValue={toDateInput(period.to)} className={input} />
          </label>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50">
            {t("apply")}
          </button>
        </form>
      </details>
    </div>
  );
}
