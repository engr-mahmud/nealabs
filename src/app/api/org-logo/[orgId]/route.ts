import { getSession } from "@/features/auth/session";
import { loadOrgContext } from "@/features/organizations/context";
import { getOrganizationLogo } from "@/features/organizations/service";

/** Serves a company logo to members of that company only. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });
  const { orgId } = await params;
  const ctx = await loadOrgContext(session.userId, orgId);
  if (!ctx) return new Response(null, { status: 404 });
  const logo = await getOrganizationLogo(orgId);
  if (!logo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.mimeType,
      "Cache-Control": "private, max-age=86400",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
