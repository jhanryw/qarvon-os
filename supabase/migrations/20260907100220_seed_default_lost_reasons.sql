-- Motivos de perda padrão, para toda organização existente — genérico
-- (INSERT ... SELECT a partir de organizations, nunca UUID hardcoded) e
-- idempotente, mesmo padrão de 20260904001500_seed_default_pipeline_and_stages.sql.
-- Totalmente editável depois pela UI de Configurações (create/rename/
-- desativar via lost_reasons, sem função dedicada — é RLS simples, mesmo
-- padrão já usado para lead_sources).
insert into public.lost_reasons (organization_id, name, active)
select o.id, reason.name, true
from public.organizations o
cross join (
  values
    ('Preço'),
    ('Não respondeu'),
    ('Sem orçamento'),
    ('Sem timing'),
    ('Escolheu concorrente'),
    ('Não qualificado'),
    ('Outro')
) as reason(name)
on conflict (organization_id, name) do nothing;
