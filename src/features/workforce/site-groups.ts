import type { SiteGroup } from "./components/worker-form";

/** Groups active sites by client for the site drop-down. */
export function groupSites(sites: { id: string; name: string; client: { nameEn: string; nameAr: string | null } }[], locale: string): SiteGroup[] {
  const groups = new Map<string, SiteGroup>();
  for (const s of sites) {
    const client = locale === "ar" && s.client.nameAr ? s.client.nameAr : s.client.nameEn;
    if (!groups.has(client)) groups.set(client, { client, sites: [] });
    groups.get(client)!.sites.push({ id: s.id, name: s.name });
  }
  return [...groups.values()];
}
