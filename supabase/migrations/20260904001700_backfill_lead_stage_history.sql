-- Evento sintético de bootstrap para leads legados que já foram atribuídos
-- a um pipeline/stage (migration anterior) mas ainda não têm nenhum
-- lead_stage_history. changed_at é o timestamp REAL de execução desta
-- migration (now()), NUNCA leads.created_at: não sabemos que esses leads
-- "estavam" na primeira stage desde a criação, porque pipeline nem existia
-- naquela época — usar created_at falsificaria uma história que nunca foi
-- rastreada. Semântica correta: "a partir deste instante começamos a
-- rastrear este lead no pipeline". changed_by fica NULL: não há usuário
-- real que tenha movido esses leads manualmente.
--
-- Consequência para analytics: para esses leads legados, "tempo até
-- WON"/"tempo por stage" vão medir a partir do bootstrap, não da criação
-- real do lead — honesto (não havia rastreamento antes disso), mas produz
-- tempo-na-primeira-etapa artificialmente curto comparado a leads criados
-- depois do M2 (ver docs/DATABASE.md).
--
-- Idempotente: só cria evento para lead que ainda não tem nenhum.

insert into public.lead_stage_history (
  organization_id, lead_id,
  from_pipeline_id, from_stage_id, from_position,
  to_pipeline_id, to_stage_id, to_position,
  changed_by, changed_at
)
select
  l.organization_id, l.id,
  null, null, null,
  l.pipeline_id, l.stage_id, ps.position,
  null, now()
from public.leads l
join public.pipeline_stages ps on ps.id = l.stage_id
where l.pipeline_id is not null
  and l.stage_id is not null
  and not exists (
    select 1 from public.lead_stage_history h where h.lead_id = l.id
  );
