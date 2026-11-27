import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { daysUntil, expiryStatus } from "../expiry";

/** Expiry date with a colour: red when expired, amber within 30 days, neutral otherwise. */
export async function ExpiryBadge({ label, date, today }: { label: string; date: Date | null; today: Date }) {
  const status = expiryStatus(date, today);
  if (status === "none" || !date) return null;
  const t = await getTranslations("workers.expiry");
  const format = await getFormatter();
  const formatted = format.dateTime(date, { dateStyle: "medium", timeZone: "UTC" });
  const text =
    status === "expired" ? t("expiredOn", { date: formatted }) : status === "soon" ? t("expiresIn", { days: daysUntil(date, today) }) : t("ok", { date: formatted });
  return (
    <Badge tone={status === "expired" ? "danger" : status === "soon" ? "warning" : "neutral"}>
      {label}: {text}
    </Badge>
  );
}
