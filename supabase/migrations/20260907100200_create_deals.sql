-- Negócio fechado (WON). Entidade dedicada, não colunas soltas em `leads`:
-- MRR/TCV são dados financeiros de um evento comercial específico (o
-- fechamento), não atributos do lead em si — e um lead só tem no máximo um
-- fechamento vigente (unique(lead_id)), mesmo que no futuro negócios
-- reabertos precisem de outro modelo (fora de escopo agora).
--
-- MRR = Monthly Recurring Revenue, TCV = Total Contract Value. Ambos
-- nullable (a empresa pode só saber um dos dois), mas nunca os dois nulos
-- ao mesmo tempo — um "fechamento" sem nenhum valor não tem sentido de
-- negócio. Escrita só por close_lead_won (migration
-- 20260907100300_create_close_lead_functions.sql), nunca INSERT direto.
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  lead_id uuid not null,

  mrr numeric(14, 2),
  tcv numeric(14, 2),
  note text,

  closed_by uuid,
  closed_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint deals_mrr_non_negative check (mrr is null or mrr >= 0),
  constraint deals_tcv_non_negative check (tcv is null or tcv >= 0),
  constraint deals_mrr_or_tcv_present check (mrr is not null or tcv is not null),

  constraint deals_lead_id_key unique (lead_id),
  -- Alvo de FK composta para conversion_events.deal_id.
  constraint deals_id_organization_id_key unique (id, organization_id),

  constraint deals_lead_same_organization
    foreign key (lead_id, organization_id)
    references public.leads (id, organization_id),
  constraint deals_closed_by_same_organization
    foreign key (closed_by, organization_id)
    references public.profiles (id, organization_id)
);

create trigger deals_set_updated_at
  before update on public.deals
  for each row
  execute function public.set_updated_at();

create index deals_organization_id_closed_at_idx
  on public.deals (organization_id, closed_at desc);

alter table public.deals enable row level security;

create policy deals_select_own_org
  on public.deals
  for select
  to authenticated
  using (organization_id = public.current_profile_organization_id());

-- Sem policy de INSERT/UPDATE/DELETE: escrita só via close_lead_won
-- (SECURITY DEFINER), nunca por INSERT direto do client.
