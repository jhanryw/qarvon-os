-- Pipeline comercial configurável por organização (M2.1). O schema suporta
-- múltiplos pipelines por organização desde já; o produto usa apenas um
-- ("Pipeline Comercial") por enquanto — ver seed em
-- 20260904001500_seed_default_pipeline_and_stages.sql.

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint pipelines_name_not_blank check (length(trim(name)) > 0),
  -- Alvo da FK composta de pipeline_stages.pipeline_id / leads.pipeline_id.
  constraint pipelines_id_organization_id_key unique (id, organization_id),
  constraint pipelines_organization_id_name_key unique (organization_id, name)
);

create trigger pipelines_set_updated_at
  before update on public.pipelines
  for each row
  execute function public.set_updated_at();

-- No máximo um pipeline default ativo por organização, garantido no banco
-- (índice único parcial), não só pela aplicação. "No máximo", não
-- "exatamente um": M2.2 deve falhar explicitamente (AppError) se a
-- organização não tiver nenhum pipeline default configurado — sem trigger
-- de existência obrigatória aqui.
create unique index pipelines_one_default_per_organization
  on public.pipelines (organization_id)
  where is_default and active;

alter table public.pipelines enable row level security;

create policy pipelines_select_own_org
  on public.pipelines
  for select
  to authenticated
  using (organization_id = public.current_profile_organization_id());

create policy pipelines_insert_own_org
  on public.pipelines
  for insert
  to authenticated
  with check (organization_id = public.current_profile_organization_id());

create policy pipelines_update_own_org
  on public.pipelines
  for update
  to authenticated
  using (organization_id = public.current_profile_organization_id())
  with check (organization_id = public.current_profile_organization_id());

-- Sem policy de DELETE: pipeline nunca é excluído (preserva histórico
-- comercial); desativa-se via active = false.
