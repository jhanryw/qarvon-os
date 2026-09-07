-- Motivos de perda configuráveis por organização — mesmo padrão exato de
-- lead_sources (M1): entidade simples id/organization_id/name/active,
-- gerenciável no futuro pela mesma convenção de UI, sem inventar um
-- segundo formato de "lista configurável por organização".
create table public.lost_reasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lost_reasons_name_not_blank check (length(trim(name)) > 0),
  -- Alvo da FK composta de leads.lost_reason_id.
  constraint lost_reasons_id_organization_id_key unique (id, organization_id),
  constraint lost_reasons_organization_id_name_key unique (organization_id, name)
);

create trigger lost_reasons_set_updated_at
  before update on public.lost_reasons
  for each row
  execute function public.set_updated_at();

alter table public.lost_reasons enable row level security;

create policy lost_reasons_select_own_org
  on public.lost_reasons
  for select
  to authenticated
  using (organization_id = public.current_profile_organization_id());

create policy lost_reasons_insert_own_org
  on public.lost_reasons
  for insert
  to authenticated
  with check (organization_id = public.current_profile_organization_id());

create policy lost_reasons_update_own_org
  on public.lost_reasons
  for update
  to authenticated
  using (organization_id = public.current_profile_organization_id())
  with check (organization_id = public.current_profile_organization_id());

-- Sem policy de DELETE: mesmo padrão de lead_sources — desativa-se via
-- active = false, nunca se apaga (poderia já estar referenciado por
-- leads.lost_reason_id).

-- leads.lost_reason_id/lost_note: por que direto em `leads`, diferente de
-- deals (que é entidade própria) — motivo de perda é uma característica
-- leve do PRÓPRIO lead no momento em que ele foi perdido (2 campos, sem
-- vida própria como MRR/TCV/closed_by), não um evento comercial com dados
-- financeiros. O timestamp de quando foi perdido já existe implicitamente
-- em lead_stage_history (transição para a stage LOST) — não duplicado
-- aqui.
alter table public.leads
  add column lost_reason_id uuid,
  add column lost_note text;

alter table public.leads
  add constraint leads_lost_reason_same_organization
  foreign key (lost_reason_id, organization_id)
  references public.lost_reasons (id, organization_id);
