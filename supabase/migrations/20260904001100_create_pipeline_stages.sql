-- Estágios do pipeline, configuráveis por organização (não hardcoded no
-- produto). stage_type é enum fixo do produto (mesmo padrão de
-- lead_temperature) — a UI nunca decide semântica terminal pelo nome
-- textual da stage.

create type public.pipeline_stage_type as enum ('OPEN', 'WON', 'LOST');

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  pipeline_id uuid not null,
  name text not null,
  position integer not null,
  probability integer not null default 0,
  stage_type public.pipeline_stage_type not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint pipeline_stages_name_not_blank check (length(trim(name)) > 0),
  constraint pipeline_stages_position_positive check (position > 0),
  constraint pipeline_stages_probability_range check (probability between 0 and 100),
  -- Probabilidade não é livre em estágios terminais: WON já é 100%
  -- realizado, LOST é 0% — travar isso no banco impede um erro de cadastro
  -- (ex.: "Fechado" com 40% de probabilidade) que corromperia o cálculo de
  -- pipeline ponderado.
  constraint pipeline_stages_won_probability_100
    check (stage_type <> 'WON' or probability = 100),
  constraint pipeline_stages_lost_probability_0
    check (stage_type <> 'LOST' or probability = 0),

  -- Tenant-safe: uma stage só pode pertencer a um pipeline da própria
  -- organização (integridade no banco, não só via RLS).
  constraint pipeline_stages_pipeline_same_organization
    foreign key (pipeline_id, organization_id)
    references public.pipelines (id, organization_id),

  -- Alvos de FK composta: leads.stage_id e lead_stage_history.from_stage_id/
  -- to_stage_id referenciam (id, pipeline_id) para garantir que uma stage
  -- referenciada sempre bate com o pipeline correto (ver
  -- 20260904001200_add_pipeline_stage_to_leads.sql). UNIQUE(id,
  -- organization_id) não é exigida por nenhuma FK hoje, mas mantém o mesmo
  -- padrão das demais tabelas tenant-aware do projeto e é barata.
  constraint pipeline_stages_id_organization_id_key unique (id, organization_id),
  constraint pipeline_stages_id_pipeline_id_key unique (id, pipeline_id),

  -- Ordenação determinística das colunas do Kanban. DEFERRABLE: uma futura
  -- reordenação (trocar position de duas stages) precisa atualizar duas
  -- linhas na mesma transação sem violar a unicidade no meio do caminho.
  constraint pipeline_stages_pipeline_position_key
    unique (pipeline_id, position) deferrable initially deferred
);

create trigger pipeline_stages_set_updated_at
  before update on public.pipeline_stages
  for each row
  execute function public.set_updated_at();

-- No máximo uma stage WON ativa e uma stage LOST ativa por pipeline: os
-- estados terminais precisam ser inequívocos para win rate/loss rate
-- (docs/METRICS.md §17-18). OPEN não tem limite de quantidade. Motivos de
-- perda diferentes não viram múltiplas stages LOST — isso pertence ao
-- futuro módulo de fechamento/perda (M4).
create unique index pipeline_stages_one_won_per_pipeline
  on public.pipeline_stages (pipeline_id)
  where stage_type = 'WON' and active;

create unique index pipeline_stages_one_lost_per_pipeline
  on public.pipeline_stages (pipeline_id)
  where stage_type = 'LOST' and active;

-- Imutabilidade de identidade: pipeline_id e stage_type nunca mudam depois
-- de criados. Mudar qualquer um dos dois reescreveria retroativamente o
-- significado de todo lead_stage_history/leads.stage_id que já referencia
-- essa stage. Se uma stage foi criada com o tipo/pipeline errado antes de
-- qualquer uso real, a correção é desativar (active = false) e criar uma
-- nova — mesmo padrão já usado para lead_sources errada (M1), não uma
-- correção "in place" de um campo que carrega semântica histórica.
-- position fica de fora desta trava de propósito: reordenar colunas é
-- esperado, e é por isso que lead_stage_history guarda from_position/
-- to_position como snapshot em vez de depender da posição atual da stage.
create or replace function public.prevent_pipeline_stage_identity_change()
returns trigger
language plpgsql
as $$
begin
  if new.pipeline_id <> old.pipeline_id then
    raise exception 'pipeline_stages.pipeline_id não pode ser alterado após a criação';
  end if;
  if new.stage_type <> old.stage_type then
    raise exception 'pipeline_stages.stage_type não pode ser alterado após a criação';
  end if;
  return new;
end;
$$;

create trigger pipeline_stages_prevent_identity_change
  before update on public.pipeline_stages
  for each row
  execute function public.prevent_pipeline_stage_identity_change();

alter table public.pipeline_stages enable row level security;

create policy pipeline_stages_select_own_org
  on public.pipeline_stages
  for select
  to authenticated
  using (organization_id = public.current_profile_organization_id());

create policy pipeline_stages_insert_own_org
  on public.pipeline_stages
  for insert
  to authenticated
  with check (organization_id = public.current_profile_organization_id());

create policy pipeline_stages_update_own_org
  on public.pipeline_stages
  for update
  to authenticated
  using (organization_id = public.current_profile_organization_id())
  with check (organization_id = public.current_profile_organization_id());

-- Sem policy de DELETE: mesmo padrão de lead_sources/leads (M1).
