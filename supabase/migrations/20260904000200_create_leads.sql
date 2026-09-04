-- Enum pequeno e fixo, definido pelo produto (não configurável por
-- organização, ao contrário de lead_sources) — mesmo padrão de user_role.
create type public.lead_temperature as enum ('COLD', 'WARM', 'HOT');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),

  -- Cadastro rápido
  name text not null,
  whatsapp text,
  company text,
  lead_source_id uuid,
  owner_id uuid,
  note text,

  -- Enriquecimento posterior
  email text,
  instagram text,
  website text,
  segment text,
  city text,
  state text,
  service_interest text,
  estimated_value numeric(14, 2),
  campaign text,
  revenue_range text,
  temperature public.lead_temperature,
  next_action text,
  next_action_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint leads_name_not_blank check (length(trim(name)) > 0),
  constraint leads_whatsapp_not_blank check (whatsapp is null or length(trim(whatsapp)) > 0),
  constraint leads_email_format check (email is null or position('@' in email) > 0),
  constraint leads_estimated_value_non_negative check (estimated_value is null or estimated_value >= 0),

  -- Integridade cross-tenant declarativa (não depende só de RLS): um lead só
  -- pode referenciar um owner ou lead_source da MESMA organização. MATCH
  -- SIMPLE (padrão) permite owner_id/lead_source_id nulos (lead ainda sem
  -- responsável/origem definida).
  constraint leads_owner_same_organization
    foreign key (owner_id, organization_id)
    references public.profiles (id, organization_id),
  constraint leads_source_same_organization
    foreign key (lead_source_id, organization_id)
    references public.lead_sources (id, organization_id)
);

create trigger leads_set_updated_at
  before update on public.leads
  for each row
  execute function public.set_updated_at();

-- Listagem paginada, mais recente primeiro, por organização.
create index leads_organization_id_created_at_idx
  on public.leads (organization_id, created_at desc);

-- "Meus leads" — filtro por responsável dentro da organização.
create index leads_organization_id_owner_id_idx
  on public.leads (organization_id, owner_id);

-- Relatório/filtro por origem.
create index leads_organization_id_lead_source_id_idx
  on public.leads (organization_id, lead_source_id);

-- Follow-ups pendentes. Parcial: a maioria dos leads não terá next_action
-- definida, então indexar só quem tem mantém o índice pequeno e útil.
create index leads_organization_id_next_action_at_idx
  on public.leads (organization_id, next_action_at)
  where next_action_at is not null;

-- Localizar lead existente pelo telefone (ex.: evitar duplicidade no
-- cadastro rápido). Parcial pelo mesmo motivo do índice acima.
create index leads_organization_id_whatsapp_idx
  on public.leads (organization_id, whatsapp)
  where whatsapp is not null;
