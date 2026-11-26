import Image from "next/image";
import Link from "next/link";
import { brand } from "@/config/brand";

export function BrandMark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-semibold text-slate-900">
      <Image src={brand.logoPath} alt="" width={28} height={28} priority />
      <span>{brand.productName}</span>
    </Link>
  );
}

export function PoweredBy({ label }: { label: string }) {
  return <p className="text-center text-xs text-slate-500">{label}</p>;
}
