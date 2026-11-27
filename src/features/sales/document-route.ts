import "server-only";
import { AppError, NotFoundError } from "@/lib/errors";
import { requireOrgAction } from "@/features/organizations/current";
import { getOrganizationLogo } from "@/features/organizations/service";
import { renderSalesDocHtml, type DocLang } from "./document-html";
import { getSalesDoc } from "./service";
import { typeSlugs } from "./status";

/** Shared by the print and PDF routes: session, tenant-scoped document, rendered HTML. */
export async function loadDocumentHtml(req: Request, id: string, forPdf: boolean) {
  const ctx = await requireOrgAction();
  const lang: DocLang = new URL(req.url).searchParams.get("lang") === "ar" ? "ar" : "en";
  const doc = await getSalesDoc(ctx, id.slice(0, 40));
  const logo = await getOrganizationLogo(ctx.organizationId);
  const logoDataUri = logo ? `data:${logo.mimeType};base64,${Buffer.from(logo.data).toString("base64")}` : null;
  const html = await renderSalesDocHtml(doc, {
    lang,
    forPdf,
    logoDataUri,
    pdfHref: `/api/sales/${doc.id}/pdf?lang=${lang}`,
    backHref: `/app/sales/${typeSlugs[doc.type]}/${doc.id}`,
  });
  const fileName = `${(doc.number ?? `draft-${doc.type.toLowerCase()}`).replace(/[^\w-]/g, "")}${lang === "ar" ? "-ar" : ""}.pdf`;
  return { html, fileName };
}

export function errorResponse(e: unknown): Response {
  if (e instanceof NotFoundError) return new Response("Not found", { status: 404 });
  if (e instanceof AppError) return new Response(null, { status: e.code === "unauthorized" ? 401 : 403 });
  throw e;
}
