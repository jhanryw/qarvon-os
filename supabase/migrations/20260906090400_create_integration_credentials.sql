-- Credenciais de integrações externas (ex.: LP pública) que criam leads via
-- create_lead_from_integration sem sessão humana. Cada credencial resolve
-- exatamente uma organização e, opcionalmente, uma lead_source padrão — a
-- função nunca aceita organization_id como parâmetro, sempre resolve a
-- partir daqui (mesmo princípio de current_profile_organization_id()
-- resolver a organização a partir de auth.uid(), adaptado para quem não
-- tem sessão: aqui "quem sou eu" vem da credencial, não do JWT).
--
-- token_hash guarda HMAC-SHA256(pepper, token) calculado em TypeScript (não
-- em SQL) com um pepper que só existe no ambiente do Qarvon OS — o banco
-- nunca vê o token em texto puro nem o pepper, só o hash final. Comprometer
-- só este hash não permite forjar um token válido (precisaria também do
-- pepper, que não está aqui). Ver supabase/BOOTSTRAP.md para o
-- procedimento de provisionamento (fora de migration, de propósito — não
-- existe um token real ainda para seedar).
--
-- Sem nenhuma policy de RLS para authenticated/anon (RLS habilitada logo
-- abaixo, nesta mesma migration): esta tabela guarda hash de segredo, e RLS
-- habilitada sem nenhuma policy já nega acesso por completo a qualquer role
-- que não seja o owner da tabela — nenhuma exposição via PostgREST hoje. Uma
-- futura tela administrativa de integrações precisaria de uma policy
-- SELECT bem escopada a ADMIN que nunca devolva token_hash (ex.: via view),
-- não implementada agora.
create table public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  slug text not null,
  token_hash text not null,
  default_lead_source_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint integration_credentials_slug_not_blank check (length(trim(slug)) > 0),
  constraint integration_credentials_slug_key unique (slug),
  constraint integration_credentials_token_hash_key unique (token_hash),

  -- Alvo de FK composta para lead_submissions.integration_credential_id.
  constraint integration_credentials_id_organization_id_key unique (id, organization_id),

  -- Tenant-safe: a lead_source padrão de uma credencial só pode ser da
  -- mesma organização da credencial.
  constraint integration_credentials_source_same_organization
    foreign key (default_lead_source_id, organization_id)
    references public.lead_sources (id, organization_id)
);

create trigger integration_credentials_set_updated_at
  before update on public.integration_credentials
  for each row
  execute function public.set_updated_at();

alter table public.integration_credentials enable row level security;
-- Nenhuma policy: RLS habilitada sem policy nega tudo para authenticated e
-- anon; a leitura que create_lead_from_integration precisa fazer acontece
-- dentro de uma função SECURITY DEFINER (contorna RLS como o owner da
-- função), igual a qualquer outra leitura interna já existente no projeto.
