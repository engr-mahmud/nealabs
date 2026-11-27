import { getTranslations } from "next-intl/server";
import { ButtonLink, buttonClass } from "@/components/ui/button";

/** Primary "Add" button plus secondary Import/Export links for a list page. */
export async function ListActions({ addHref, addLabel, importHref, exportHref, canWrite }: { addHref: string; addLabel: string; importHref: string; exportHref: string; canWrite: boolean }) {
  const t = await getTranslations("list");
  return (
    <div className="flex flex-wrap gap-2">
      <a href={exportHref} className={buttonClass("ghost")}>
        {t("exportExcel")}
      </a>
      {canWrite ? (
        <>
          <ButtonLink href={importHref} variant="secondary">
            {t("importExcel")}
          </ButtonLink>
          <ButtonLink href={addHref} size="md">
            + {addLabel}
          </ButtonLink>
        </>
      ) : null}
    </div>
  );
}
