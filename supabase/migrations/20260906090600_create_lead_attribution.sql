-- Atribuição de marketing de uma submissão específica (não do lead como um
-- todo — ver justificativa em lead_submissions). 1:1 com lead_submissions:
-- uma segunda submissão do mesmo lead (retorno) pode ter uma atribuição
-- completamente diferente (outro anúncio, outra campanha) e ambas ficam
-- preservadas, nenhuma sobrescreve a outra.
--
-- gclid/gbraid/wbraid (Google Ads: clique padrão, App Campaigns com
-- enhanced conversions, e iOS/SKAdNetwork) são só preparação de schema —
-- nenhum código de Google Ads é implementado nesta entrega.
create table public.lead_attribution (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  submission_id uuid not null,

  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  fbp text,
  fbc text,
  campaign_id text,
  adset_id text,
  ad_id text,
  gclid text,
  gbraid text,
  wbraid text,
  landing_page text,
  referrer text,

  created_at timestamptz not null default now(),

  constraint lead_attribution_submission_id_key unique (submission_id),
  constraint lead_attribution_submission_same_organization
    foreign key (submission_id, organization_id)
    references public.lead_submissions (id, organization_id)
);

alter table public.lead_attribution enable row level security;

create policy lead_attribution_select_own_org
  on public.lead_attribution
  for select
  to authenticated
  using (organization_id = public.current_profile_organization_id());

-- Deliberadamente sem policy de INSERT/UPDATE/DELETE para authenticated —
-- mesma razão de lead_submissions: escrita só via create_lead_from_integration.
