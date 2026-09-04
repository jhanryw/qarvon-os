-- pipeline_id/stage_id do lead (M2.1). NULLABLE de propósito nesta etapa:
-- createLead() do M1 ainda não resolve pipeline/stage default — isso é
-- responsabilidade do M2.2. Aplicar NOT NULL agora quebraria o cadastro de
-- lead homologado no M1. A migration de NOT NULL pertence ao fechamento do
-- M2.2, depois que o fluxo de criação transacional (lead + primeiro evento
-- de lead_stage_history) estiver implementado e homologado — esta
-- nulabilidade é compatibilidade temporária de rollout, não uma decisão
-- permanente de domínio.

alter table public.leads
  add column pipeline_id uuid,
  add column stage_id uuid;

-- Tenant-safe: um lead só referencia pipeline da própria organização.
alter table public.leads
  add constraint leads_pipeline_same_organization
  foreign key (pipeline_id, organization_id)
  references public.pipelines (id, organization_id);

-- Integridade física pipeline x stage: impossível gravar
-- lead.pipeline_id = A com lead.stage_id pertencendo a B. Como
-- pipeline_stages.organization_id já é garantido igual ao de pipelines
-- (pela FK própria de pipeline_stages), e esta FK já amarra stage_id ao
-- pipeline_id do lead, o organization_id do stage fica transitivamente
-- igual ao do lead sem precisar de uma terceira FK redundante.
alter table public.leads
  add constraint leads_stage_same_pipeline
  foreign key (stage_id, pipeline_id)
  references public.pipeline_stages (id, pipeline_id);
