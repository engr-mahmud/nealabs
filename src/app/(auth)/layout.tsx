import type { ReactNode } from "react";
import { BrandMark } from "@/components/layout/brand-mark";
import { LanguageSwitch } from "@/components/layout/language-switch";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col px-4">
      <header className="mx-auto flex w-full max-w-md items-center justify-between py-4">
        <BrandMark />
        <LanguageSwitch />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 pt-4 pb-12 sm:pt-10">{children}</main>
    </div>
  );
}
