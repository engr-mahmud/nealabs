import { z } from "zod";
import { optionalText, requiredText } from "@/lib/schema-helpers";

export const siteFieldsSchema = z.object({
  name: requiredText(160, 2),
  city: optionalText(80),
  address: optionalText(200),
  notes: optionalText(1000),
});

/** Form: the client is chosen from a list (id). */
export const siteSchema = siteFieldsSchema.extend({
  clientId: z.string().trim().min(1, { error: "chooseClient" }).max(40),
});

export type SiteFields = z.infer<typeof siteFieldsSchema>;
export type SiteInput = z.infer<typeof siteSchema>;
