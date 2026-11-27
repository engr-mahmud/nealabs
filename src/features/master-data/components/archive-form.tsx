import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";

/** Archive (with inline confirmation) or restore. Nothing is ever hard-deleted. */
export async function ArchiveForm({
  id,
  archived,
  action,
  confirmText,
}: {
  id: string;
  archived: boolean;
  action: (formData: FormData) => Promise<void>;
  confirmText: string;
}) {
  const t = await getTranslations("common");
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="archived" value={archived ? "0" : "1"} />
      {archived ? (
        <Button type="submit" variant="secondary">
          {t("restore")}
        </Button>
      ) : (
        <ConfirmSubmit label={t("archive")} confirmText={confirmText} confirmLabel={t("archive")} cancelLabel={t("cancel")} />
      )}
    </form>
  );
}
