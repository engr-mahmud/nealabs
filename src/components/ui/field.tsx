import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const inputClass =
  "block w-full min-h-11 rounded-lg border bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-slate-50 disabled:text-slate-500";

interface FieldProps extends ComponentProps<"input"> {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
  optionalLabel?: string;
  /** For numbers like VAT or IBAN that must stay left-to-right in Arabic. */
  ltr?: boolean;
}

export function Field({ label, name, error, hint, optionalLabel, ltr, className, id, ...props }: FieldProps) {
  const inputId = id ?? `f-${name}`;
  const describedBy = [error ? `${inputId}-error` : null, hint ? `${inputId}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-800">
        {label}
        {optionalLabel ? <span className="ms-1 font-normal text-slate-500">({optionalLabel})</span> : null}
      </label>
      <input
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        dir={ltr ? "ltr" : undefined}
        className={cn(inputClass, error ? "border-red-400" : "border-slate-300", ltr && "text-start rtl:text-end")}
        {...props}
      />
      {hint && !error ? (
        <p id={`${inputId}-hint`} className="text-sm text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  label,
  name,
  error,
  children,
  className,
  ...props
}: ComponentProps<"select"> & { label: string; name: string; error?: string }) {
  const id = `f-${name}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <select id={id} name={name} className={cn(inputClass, error ? "border-red-400" : "border-slate-300")} {...props}>
        {children}
      </select>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
