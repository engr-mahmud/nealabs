import type { ReactNode } from "react";

/** Shown when a list has nothing yet: says what this is for and offers the next step. */
export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="text-lg font-semibold text-slate-900">{title}</p>
      {body ? <p className="mx-auto mt-2 max-w-md text-slate-600">{body}</p> : null}
      {action ? <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
