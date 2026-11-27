"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";

type Cycle = "MONTHLY" | "QUARTERLY" | "YEARLY";

export interface PricingPlanView {
  code: string;
  name: string;
  features: string[];
  popular: boolean;
  suggested: boolean;
  prices: Record<Cycle, { amount: string; saved: string | null }>;
}

export interface PricingLabels {
  cycles: Record<Cycle, string>;
  per: Record<Cycle, string>;
  twoMonthsFree: string;
  popular: string;
  suggested: string;
  exVat: string;
  /** "{plan}" is replaced with the plan name. */
  cta: string;
  cycleGroup: string;
}

/**
 * Plans with a Monthly / Quarterly / Yearly switch; prices update instantly. Prices are
 * computed on the server from src/config/plans.ts and passed in already formatted.
 * hrefTemplate may contain {plan} and {cycle}.
 */
export function PricingTable({
  plans,
  labels,
  hrefTemplate,
  initialCycle = "YEARLY",
  headingLevel = "h3",
}: {
  plans: PricingPlanView[];
  labels: PricingLabels;
  hrefTemplate: string;
  initialCycle?: Cycle;
  headingLevel?: "h2" | "h3";
}) {
  const [cycle, setCycle] = useState<Cycle>(initialCycle);
  const Heading = headingLevel;
  const cycles: Cycle[] = ["MONTHLY", "QUARTERLY", "YEARLY"];

  return (
    <div>
      <div className="flex justify-center">
        <div role="radiogroup" aria-label={labels.cycleGroup} className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {cycles.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={cycle === c}
              onClick={() => setCycle(c)}
              className={cn(
                "relative min-h-11 rounded-lg px-3 text-sm font-medium transition-colors sm:px-5",
                cycle === c ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
              )}
            >
              {labels.cycles[c]}
              {c === "YEARLY" ? (
                <span className={cn("ms-2 rounded-full px-2 py-0.5 text-xs font-semibold", cycle === c ? "bg-white/15 text-white" : "bg-emerald-100 text-emerald-800")}>
                  {labels.twoMonthsFree}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const price = plan.prices[cycle];
          const href = hrefTemplate.replace("{plan}", plan.code).replace("{cycle}", cycle);
          return (
            <section
              key={plan.code}
              aria-labelledby={`plan-${plan.code}`}
              className={cn("flex flex-col rounded-2xl border bg-white p-6", plan.popular ? "border-brand shadow-md ring-1 ring-brand" : "border-slate-200 shadow-sm")}
            >
              <div className="flex min-h-7 flex-wrap items-center gap-2">
                <Heading id={`plan-${plan.code}`} className="text-lg font-semibold text-slate-900">
                  {plan.name}
                </Heading>
                {plan.popular ? <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">{labels.popular}</span> : null}
                {plan.suggested ? <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800">{labels.suggested}</span> : null}
              </div>
              <p className="mt-4 flex flex-wrap items-baseline gap-x-1.5" aria-live="polite">
                <span className="text-3xl font-bold tracking-tight text-slate-900">{price.amount}</span>
                <span className="text-slate-600">{labels.per[cycle]}</span>
              </p>
              <p className="mt-1 min-h-6 text-sm font-medium text-emerald-700">{price.saved ?? ""}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-700">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <svg aria-hidden viewBox="0 0 20 20" className="mt-0.5 size-4 flex-none fill-brand">
                      <path d="M7.7 13.3 4.4 10l-1.1 1.1 4.4 4.4 9-9-1.1-1.1z" />
                    </svg>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={href}
                className={cn(
                  "mt-6 inline-flex min-h-12 items-center justify-center rounded-lg px-4 font-medium transition-colors",
                  plan.popular ? "bg-brand text-brand-foreground hover:bg-brand-hover" : "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
                )}
              >
                {labels.cta.replace("{plan}", plan.name)}
              </Link>
            </section>
          );
        })}
      </div>
      <p className="mt-4 text-center text-sm text-slate-600">{labels.exVat}</p>
    </div>
  );
}
