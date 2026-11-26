/* Customer logos are served by our own route, so a plain img is fine (no remote image config needed). */
/* eslint-disable @next/next/no-img-element */
export function OrgAvatar({ orgId, name, logoVersion, size = 32 }: { orgId: string; name: string; logoVersion: string | null; size?: number }) {
  if (logoVersion) {
    return (
      <img
        src={`/api/org-logo/${orgId}?v=${encodeURIComponent(logoVersion)}`}
        alt=""
        width={size}
        height={size}
        className="rounded-md border border-slate-200 bg-white object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span aria-hidden className="inline-flex items-center justify-center rounded-md bg-slate-900 font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {initial}
    </span>
  );
}
