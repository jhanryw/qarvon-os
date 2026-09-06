import { z } from "zod";

// Códigos estáveis, persistidos em public.leads.revenue_range e validados
// no banco por CHECK (migration 20260906090200). Nunca renomear um valor
// existente — isso quebraria dado já persistido; adicionar um código novo
// é seguro (schema + CHECK), sempre nos dois lugares juntos.
//
// Fonte única para os dois contratos que usam este campo (lib/leads/schemas.ts
// e lib/integrations/leads/schema.ts) — evita que os dois divergam com o
// tempo. Os rótulos exibidos ao usuário (ex.: "R$100 mil a R$500 mil/mês")
// são responsabilidade de quem renderiza (LP, futura UI do CRM), nunca
// deste módulo nem do valor persistido.
export const REVENUE_RANGE_CODES = [
  "under_30k",
  "30k_100k",
  "100k_500k",
  "500k_1m",
  "over_1m",
] as const;

export type RevenueRangeCode = (typeof REVENUE_RANGE_CODES)[number];

export const revenueRangeCodeSchema = z.enum(REVENUE_RANGE_CODES);
