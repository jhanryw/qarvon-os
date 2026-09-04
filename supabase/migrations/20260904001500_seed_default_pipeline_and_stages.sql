-- Cria o "Pipeline Comercial" e seus 9 estágios (docs/PRODUCT.md §3) para
-- toda organização existente, de forma genérica (INSERT ... SELECT a partir
-- de organizations — nunca um UUID de organização hardcoded) e idempotente
-- (seguro reexecutar).
--
-- Probabilidades: proposta inicial de negócio (a recalibrar futuramente com
-- dados reais, não uma medição): Novo Lead 5, Contato Iniciado 10,
-- Qualificado 25, Reunião Agendada 40, Reunião Realizada 55, Proposta
-- Enviada 70, Negociação 85, Fechado (WON) 100, Perdido (LOST) 0.

insert into public.pipelines (organization_id, name, is_default, active)
select id, 'Pipeline Comercial', true, true
from public.organizations
on conflict (organization_id, name) do nothing;

insert into public.pipeline_stages (
  organization_id, pipeline_id, name, position, probability, stage_type
)
select p.organization_id, p.id, s.name, s.position, s.probability, s.stage_type
from public.pipelines p
cross join (
  values
    ('Novo Lead', 1, 5, 'OPEN'::public.pipeline_stage_type),
    ('Contato Iniciado', 2, 10, 'OPEN'::public.pipeline_stage_type),
    ('Qualificado', 3, 25, 'OPEN'::public.pipeline_stage_type),
    ('Reunião Agendada', 4, 40, 'OPEN'::public.pipeline_stage_type),
    ('Reunião Realizada', 5, 55, 'OPEN'::public.pipeline_stage_type),
    ('Proposta Enviada', 6, 70, 'OPEN'::public.pipeline_stage_type),
    ('Negociação', 7, 85, 'OPEN'::public.pipeline_stage_type),
    ('Fechado', 8, 100, 'WON'::public.pipeline_stage_type),
    ('Perdido', 9, 0, 'LOST'::public.pipeline_stage_type)
) as s(name, position, probability, stage_type)
where p.name = 'Pipeline Comercial'
  and p.is_default
  and not exists (
    select 1
    from public.pipeline_stages ps
    where ps.pipeline_id = p.id
      and ps.position = s.position
  );
