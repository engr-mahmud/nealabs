import { getLocale, getTranslations } from "next-intl/server";
import { formatSar } from "@/lib/money";

/** A light, image-free sketch of the product (an invoice and a salary sheet) for the hero. */
export async function ProductPreview() {
  const [t, locale] = await Promise.all([getTranslations("marketing.preview"), getLocale()]);
  const sar = (h: number) => formatSar(h, locale);
  const qr = [
    "1111111001011111111", "1000001010010000001", "1011101001010111101", "1011101011010111101", "1000001000110000001", "1111111010101111111", "0000000011100000000",
    "1101011100111010110", "0110100101001101001", "1010111010110010111", "0000000010101011000", "1111111001110101101", "1000001011010010011", "1011101000101101110",
    "1011101010110010101", "1000001001101100010", "1111111010011011111",
  ];
  return (
    <div role="img" aria-label={t("label")} className="relative mx-auto w-full max-w-md select-none">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5">
        <div className="flex items-start justify-between gap-4 border-b-2 border-brand pb-3">
          <div>
            <p className="text-xs text-slate-500">{t("invoice")}</p>
            <p className="font-semibold text-slate-900">
              <span className="ltr-nums">INV-00042</span>
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">{t("paid")}</span>
        </div>
        <p className="mt-3 text-sm font-medium text-slate-800">{t("client")}</p>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-600">{t("line1")}</dt>
            <dd className="font-medium">{sar(4_200_000)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-600">{t("line2")}</dt>
            <dd className="font-medium">{sar(360_000)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-600">{t("vat")}</dt>
            <dd className="font-medium">{sar(684_000)}</dd>
          </div>
        </dl>
        <div className="mt-3 flex items-end justify-between gap-4 border-t border-slate-200 pt-3">
          <svg aria-hidden viewBox="0 0 19 17" className="size-16" shapeRendering="crispEdges">
            {qr.flatMap((row, y) => [...row].map((c, x) => (c === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#0f172a" /> : null)))}
          </svg>
          <div className="text-end">
            <p className="text-xs text-slate-500">{t("total")}</p>
            <p className="text-2xl font-bold text-slate-900">{sar(5_244_000)}</p>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-6 -start-4 hidden w-60 rounded-xl border border-slate-200 bg-white p-4 shadow-lg sm:block">
        <p className="text-xs text-slate-500">{t("salary")}</p>
        <div className="mt-1 flex items-center justify-between">
          <span className="font-semibold text-slate-900">{t("workers")}</span>
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">{t("approved")}</span>
        </div>
      </div>
      <div className="absolute -top-4 -end-3 hidden rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 shadow-md sm:block">{t("expiring")}</div>
    </div>
  );
}
