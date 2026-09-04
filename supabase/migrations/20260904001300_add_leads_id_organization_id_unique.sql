-- Necessária como alvo da FK composta de lead_stage_history.lead_id.
-- Aditiva e segura: id já é PK/único sozinho, então esta constraint não
-- muda nenhum dado nem comportamento existente (mesmo padrão já usado para
-- profiles/lead_sources em M1).

alter table public.leads
  add constraint leads_id_organization_id_key unique (id, organization_id);
