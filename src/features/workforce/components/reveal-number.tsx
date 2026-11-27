"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { revealDocumentAction } from "../actions";

/** Masked Iqama/passport number with a "Show" button. Each reveal is audited on the server. */
export function RevealNumber({ workerId, document, last4 }: { workerId: string; document: "iqama" | "passport"; last4: string }) {
  const t = useTranslations("workers");
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = () => {
    if (value) return setValue(null);
    start(async () => {
      const res = await revealDocumentAction(workerId, document);
      setError(res.error ?? null);
      setValue(res.value);
    });
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="ltr-nums font-mono text-slate-900">{value ?? `•••• ${last4}`}</span>
      <button type="button" onClick={toggle} disabled={pending} className="min-h-9 rounded-lg px-2 text-sm font-medium text-brand hover:bg-brand/5 disabled:opacity-60" title={t("revealNote")}>
        {value ? t("hide") : t("show")}
      </button>
      {error ? <span className="text-sm text-red-700">{error}</span> : null}
    </span>
  );
}
