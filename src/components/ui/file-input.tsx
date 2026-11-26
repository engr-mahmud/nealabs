"use client";

import { useId, useState } from "react";

/** File picker with translated text (the native one follows the browser language, not the app). */
export function FileInput({ name, accept, required, chooseLabel, noFileLabel, describedBy }: { name: string; accept: string; required?: boolean; chooseLabel: string; noFileLabel: string; describedBy?: string }) {
  const id = useId();
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <input
        id={id}
        name={name}
        type="file"
        accept={accept}
        required={required}
        aria-describedby={describedBy}
        className="peer sr-only"
        onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
      />
      <label
        htmlFor={id}
        className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg bg-slate-100 px-4 text-sm font-medium text-slate-800 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand hover:bg-slate-200"
      >
        {chooseLabel}
      </label>
      <span className="truncate text-sm text-slate-500" dir="auto">
        {fileName ?? noFileLabel}
      </span>
    </div>
  );
}
