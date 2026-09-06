-- Preparação de schema para a integração de leads públicos (LP -> Qarvon
-- OS). Puramente aditivo: três colunas novas, todas nullable, em uma tabela
-- já existente — nenhum lead atual, humano ou não, é afetado.
--
-- invests_paid_traffic: resposta de qualificação capturada pela LP, sem
-- equivalente hoje.
-- whatsapp_normalized: forma canônica (E.164) do WhatsApp, calculada pela
-- função que cria leads (_create_lead_with_pipeline_core, migration
-- futura) — não confundir com a coluna `whatsapp` existente, que continua
-- guardando o valor como foi digitado/recebido, sem normalização. Existe
-- para permitir deduplicação confiável independente de formatação, coisa
-- que a coluna `whatsapp` bruta não permite hoje.
-- last_intake_at: quando o lead foi visto pela última vez chegando por uma
-- submissão (nova ou de retorno) — distinto de updated_at, que também
-- muda em qualquer edição manual no CRM.

alter table public.leads
  add column invests_paid_traffic boolean,
  add column whatsapp_normalized text,
  add column last_intake_at timestamptz;

-- Consulta de deduplicação (buscar lead OPEN existente pelo mesmo
-- WhatsApp normalizado dentro da organização) — parcial pelo mesmo motivo
-- do índice já existente em `whatsapp`: a maioria das linhas antigas não
-- terá este valor preenchido.
create index leads_organization_id_whatsapp_normalized_idx
  on public.leads (organization_id, whatsapp_normalized)
  where whatsapp_normalized is not null;
