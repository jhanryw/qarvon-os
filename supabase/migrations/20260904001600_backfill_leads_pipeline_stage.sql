-- Atribui pipeline/stage inicial aos leads que ainda não têm (leads
-- criados antes do M2, ou qualquer lead criado antes do M2.2 atualizar
-- createLead() — ver nota de nulabilidade temporária em
-- 20260904001200_add_pipeline_stage_to_leads.sql). Não depende de
-- quantidade conhecida de leads nem de UUID hardcoded: resolve o pipeline
-- default e a primeira stage OPEN ativa (menor position) por organização,
-- dinamicamente. Idempotente: só afeta leads com pipeline_id ainda nulo.

update public.leads l
set
  pipeline_id = p.id,
  stage_id = s.id
from public.pipelines p
join lateral (
  select ps.id
  from public.pipeline_stages ps
  where ps.pipeline_id = p.id
    and ps.stage_type = 'OPEN'
    and ps.active
  order by ps.position asc
  limit 1
) s on true
where p.organization_id = l.organization_id
  and p.is_default
  and p.active
  and l.pipeline_id is null;
