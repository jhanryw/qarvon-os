-- Histórico imutável de transições de estágio (M2.1). Event log
-- append-only: cada linha é uma transição from_* -> to_*, nunca um
-- "intervalo" com exited_at (isso exigiria UPDATE, quebrando a
-- imutabilidade). Tempo por estágio/lead time são derivados por window
-- function sobre changed_at em tempo de consulta, não armazenados aqui.
--
-- from_pipeline_id/from_stage_id/from_position são separados de
-- to_pipeline_id/to_stage_id/to_position (em vez de um único pipeline_id
-- compartilhado) para poder representar corretamente uma futura mudança de
-- pipeline (Pipeline A/Stage X -> Pipeline B/Stage Y) sem redesenho de
-- schema — não implementado ainda (M2 não implementa troca de pipeline),
-- só não impossibilitado.
--
-- from_position/to_position são SNAPSHOTS da position no momento da
-- transição, não a position atual da stage — stages podem ser reordenadas
-- depois, e usar a position atual corromperia silenciosamente o cálculo de
-- regressão sobre eventos antigos.

create table public.lead_stage_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  lead_id uuid not null,

  from_pipeline_id uuid,
  from_stage_id uuid,
  from_position integer,

  to_pipeline_id uuid not null,
  to_stage_id uuid not null,
  to_position integer not null,

  -- NULL apenas no evento sintético de bootstrap dos leads legados (M2.1)
  -- — não há usuário real que tenha "movido" esses leads. Toda transição
  -- real a partir do M2.2 sempre preenche changed_by (regra de aplicação
  -- na futura função transacional, não uma constraint aqui).
  changed_by uuid,
  changed_at timestamptz not null default now(),

  constraint lead_stage_history_to_position_positive check (to_position > 0),
  constraint lead_stage_history_from_position_positive
    check (from_position is null or from_position > 0),

  -- Só dois estados válidos: bootstrap (from_* inteiramente nulo) ou
  -- transição real (from_* inteiramente preenchido). Sem isso, MATCH SIMPLE
  -- nas FKs abaixo permitiria combinações parciais que não correspondem a
  -- nenhum evento real.
  constraint lead_stage_history_from_all_or_nothing check (
    (from_pipeline_id is null and from_stage_id is null and from_position is null)
    or
    (from_pipeline_id is not null and from_stage_id is not null and from_position is not null)
  ),

  constraint lead_stage_history_lead_same_organization
    foreign key (lead_id, organization_id)
    references public.leads (id, organization_id),

  constraint lead_stage_history_to_pipeline_same_organization
    foreign key (to_pipeline_id, organization_id)
    references public.pipelines (id, organization_id),
  constraint lead_stage_history_to_stage_same_pipeline
    foreign key (to_stage_id, to_pipeline_id)
    references public.pipeline_stages (id, pipeline_id),

  constraint lead_stage_history_from_pipeline_same_organization
    foreign key (from_pipeline_id, organization_id)
    references public.pipelines (id, organization_id),
  constraint lead_stage_history_from_stage_same_pipeline
    foreign key (from_stage_id, from_pipeline_id)
    references public.pipeline_stages (id, pipeline_id),

  constraint lead_stage_history_changed_by_same_organization
    foreign key (changed_by, organization_id)
    references public.profiles (id, organization_id)
);

-- Sem trigger de updated_at: é log imutável, nunca é atualizado — essa
-- coluna seria falsa aqui.

-- Timeline da página do lead.
create index lead_stage_history_lead_id_changed_at_idx
  on public.lead_stage_history (lead_id, changed_at);

-- Agregações de dashboard por período, escopadas por organização.
create index lead_stage_history_organization_id_changed_at_idx
  on public.lead_stage_history (organization_id, changed_at);

alter table public.lead_stage_history enable row level security;

create policy lead_stage_history_select_own_org
  on public.lead_stage_history
  for select
  to authenticated
  using (organization_id = public.current_profile_organization_id());

-- Deliberadamente SEM policy de INSERT/UPDATE/DELETE para "authenticated".
-- O histórico é consequência de uma transição real, não um dado que o
-- client escreve diretamente: um INSERT direto exposto ao "authenticated"
-- deixaria a RLS resolver isolamento de tenant, mas não a legitimidade do
-- evento — um usuário autenticado poderia fabricar eventos históricos
-- válidos para a própria organização sem que o estado real do lead
-- (leads.pipeline_id/stage_id) tivesse de fato mudado. A escrita futura
-- (M2.2) será feita por uma função Postgres transacional dedicada
-- (SELECT ... FOR UPDATE no lead -> validar destino -> UPDATE leads ->
-- INSERT lead_stage_history, tudo na mesma transação), não pela API
-- pública de tabela. O owner da tabela (papel usado para aplicar
-- migrations/seed/backfill) contorna RLS normalmente e não precisa de
-- policy para inserir.
