import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { LegalPage } from "@/features/marketing/components/legal-page";
import { legalDoc } from "@/features/marketing/legal";

export async function generateMetadata(): Promise<Metadata> {
  const doc = legalDoc("privacy", (await getLocale()) === "ar" ? "ar" : "en");
  return { title: doc.title };
}

export default async function Page() {
  return <LegalPage kind="privacy" />;
}
