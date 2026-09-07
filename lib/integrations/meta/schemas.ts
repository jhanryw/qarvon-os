import { z } from "zod";

export const conversionValueModeSchema = z.enum(["MRR", "TCV"]);

// accessToken nulo/omitido = "não alterar o token atual" (ver
// upsert_meta_integration) — nunca reenviamos o token real de volta para o
// client para preencher o form, então essa distinção é feita no backend.
export const metaIntegrationSettingsSchema = z.object({
  pixelId: z.string().trim().min(1).max(64).optional().nullable(),
  accessToken: z.string().trim().min(1).max(512).optional().nullable(),
  conversionValueMode: conversionValueModeSchema.optional().nullable(),
  active: z.boolean().optional().nullable(),
});
export type MetaIntegrationSettingsInput = z.infer<typeof metaIntegrationSettingsSchema>;
