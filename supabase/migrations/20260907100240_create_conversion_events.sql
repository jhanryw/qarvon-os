-- Idempotência e rastreamento de conversões enviadas à Meta. unique(deal_id,
-- event_name) é a chave de idempotência lógica: um mesmo deal nunca gera
-- dois eventos "Purchase" (o INSERT em close_lead_won usa ON CONFLICT DO
-- NOTHING sobre esta constraint). event_name já vem parametrizado (não
-- fixo em "Purchase" só no código) para comportar Lead/QualifiedLead no
-- futuro (ver docs da decisão) sem migração de schema nova.
--
-- Não é escrita nem lida pelo client diretamente: close_lead_won cria a
-- linha PENDING (mesma transação do fechamento, nunca depois — garante que
-- a obrigação de notificar a Meta sobrevive mesmo se o processo Node
-- morrer logo após o commit); o envio real e a atualização de status
-- acontecem em lib/integrations/meta/* via createAdminClient(), depois que
-- a transação de fechamento já commitou.
create type public.conversion_event_status as enum ('PENDING', 'SENT', 'FAILED');

create table public.conversion_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  deal_id uuid not null,
  event_name text not null default 'Purchase',
  status public.conversion_event_status not null default 'PENDING',
  attempts integer not null default 0,
  last_error text,
  meta_event_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint conversion_events_attempts_non_negative check (attempts >= 0),
  constraint conversion_events_deal_event_key unique (deal_id, event_name),
  constraint conversion_events_deal_same_organization
    foreign key (deal_id, organization_id)
    references public.deals (id, organization_id)
);

create trigger conversion_events_set_updated_at
  before update on public.conversion_events
  for each row
  execute function public.set_updated_at();

-- Localizar pendências/falhas para retry (dashboard futuro ou botão
-- manual de "reenviar").
create index conversion_events_organization_id_status_idx
  on public.conversion_events (organization_id, status);

alter table public.conversion_events enable row level security;

create policy conversion_events_select_own_org
  on public.conversion_events
  for select
  to authenticated
  using (organization_id = public.current_profile_organization_id());

-- Sem policy de INSERT/UPDATE/DELETE: escrita só via close_lead_won
-- (PENDING inicial) e via código server-side de disparo/retry
-- (createAdminClient(), nunca exposto ao client).
