create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_sources_name_not_blank check (length(trim(name)) > 0),
  -- Necessária como alvo da FK composta em leads.lead_source_id (garante
  -- que um lead só referencia lead_source da própria organização).
  constraint lead_sources_id_organization_id_key unique (id, organization_id),
  constraint lead_sources_organization_id_name_key unique (organization_id, name)
);

create trigger lead_sources_set_updated_at
  before update on public.lead_sources
  for each row
  execute function public.set_updated_at();
