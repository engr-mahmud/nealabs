import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function TextareaField({ label, name, error, className, ...props }: ComponentProps<"textarea"> & { label: string; name: string; error?: string }) {
  const id = `f-${name}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          "block w-full rounded-lg border bg-white px-3 py-2 text-base text-slate-900 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500",
          error ? "border-red-400" : "border-slate-300",
        )}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
