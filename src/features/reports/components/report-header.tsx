import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";

/** Title, a link back to all reports and the Excel download (allowed in read-only mode). */
export async function ReportHeader({ title, subtitle, exportHref }: { title: string; subtitle: string; exportHref: string | null }) {
  const t = await getTranslations("reports");
  return (
    <>
      <Link href="/app/reports" className="mb-3 inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline">
        <span aria-hidden className="me-1 inline-block rtl:rotate-180">←</span> {t("all")}
      </Link>
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          exportHref ? (
            <a href={exportHref} className={buttonClass("secondary")} download>
              {t("export")}
            </a>
          ) : null
        }
      />
    </>
  );
}
