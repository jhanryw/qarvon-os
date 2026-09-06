import { z } from "zod";
import { revenueRangeCodeSchema } from "@/lib/leads/revenue-range";

// Contrato de atribuição de marketing de uma submissão. Todos os campos são
// opcionais (a LP pode não ter nenhum parâmetro de campanha numa visita
// direta) — .strict() rejeita qualquer chave fora desta lista, mesmo padrão
// de lib/leads/schemas.ts. gclid/gbraid/wbraid (Google Ads) já fazem parte
// do contrato mesmo sem nenhuma integração Google implementada ainda —
// symmetria com lead_attribution (banco), preparação de schema.
const attributionFields = {
  utm_source: z.string().trim().min(1).max(256).optional().nullable(),
  utm_medium: z.string().trim().min(1).max(256).optional().nullable(),
  utm_campaign: z.string().trim().min(1).max(256).optional().nullable(),
  utm_content: z.string().trim().min(1).max(256).optional().nullable(),
  utm_term: z.string().trim().min(1).max(256).optional().nullable(),
  fbclid: z.string().trim().min(1).max(512).optional().nullable(),
  fbp: z.string().trim().min(1).max(512).optional().nullable(),
  fbc: z.string().trim().min(1).max(512).optional().nullable(),
  campaign_id: z.string().trim().min(1).max(256).optional().nullable(),
  adset_id: z.string().trim().min(1).max(256).optional().nullable(),
  ad_id: z.string().trim().min(1).max(256).optional().nullable(),
  gclid: z.string().trim().min(1).max(512).optional().nullable(),
  gbraid: z.string().trim().min(1).max(512).optional().nullable(),
  wbraid: z.string().trim().min(1).max(512).optional().nullable(),
  landing_page: z.string().trim().min(1).max(2048).optional().nullable(),
  // Sem .min(1): visita direta (sem referrer) é uma string vazia legítima,
  // diferente de "não informado" — as duas ficam representáveis.
  referrer: z.string().trim().max(2048).optional().nullable(),
};

export const leadIntakeAttributionSchema = z.object(attributionFields).strict();
export type LeadIntakeAttribution = z.infer<typeof leadIntakeAttributionSchema>;

// Contrato do payload recebido em POST /api/integrations/leads. Whitelist
// deliberadamente menor que a do CRM humano (lib/leads/schemas.ts): campos
// de enriquecimento (note, email, segment, temperature, etc.) não fazem
// parte deste contrato, são preenchidos depois via CRM — mesma fronteira
// já imposta no lado do banco por create_lead_from_integration.
export const leadIntakeSchema = z
  .object({
    version: z.number().int().positive().optional().default(1),
    external_submission_id: z.string().trim().min(1).max(200),
    name: z.string().trim().min(2).max(160),
    whatsapp: z.string().trim().min(1).max(30),
    company: z.string().trim().min(1).max(200).optional().nullable(),
    revenue_range: revenueRangeCodeSchema.optional().nullable(),
    invests_paid_traffic: z.boolean().optional().nullable(),
    attribution: leadIntakeAttributionSchema.optional(),
  })
  .strict();

export type LeadIntakeInput = z.infer<typeof leadIntakeSchema>;
