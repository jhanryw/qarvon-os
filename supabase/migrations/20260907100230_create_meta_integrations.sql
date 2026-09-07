-- Configuração de Meta Conversions API por organização. Auditoria (2ª
-- rodada, explícita) confirmou de novo: não existe company_integrations,
-- integration_secrets, vault, pgsodium ou qualquer secret store no
-- projeto — integration_credentials.token_hash é o único precedente, mas
-- resolve um problema diferente (só precisa COMPARAR um hash; nunca
-- precisa recuperar o valor original). A Meta exige o token em texto puro
-- na chamada HTTP — não há como guardar só um hash aqui.
--
-- Separação em duas tabelas, de propósito:
--   meta_integrations       -> configuração não sensível (pixel/dataset id,
--                              modo de valor, ativo/inativo, timestamps).
--   meta_integration_secrets -> só o token, e NUNCA em texto puro: cifrado
--                              com pgcrypto (pgp_sym_encrypt/pgp_sym_decrypt,
--                              já disponível — extensão pgcrypto habilitada
--                              desde 20260903120000_extensions_and_helpers.sql).
--
-- A chave de cifragem NUNCA fica no banco (nem em pg_settings, nem em
-- coluna, nem em config de sessão) — é um parâmetro passado a cada chamada
-- pelas funções SECURITY DEFINER, vindo de uma variável de ambiente do
-- servidor Next.js (META_TOKEN_ENCRYPTION_KEY, mesmo modelo de custódia já
-- usado para INTEGRATION_TOKEN_PEPPER: só existe no processo Node, nunca
-- no Postgres, nunca no client). Comprometer só o banco não é suficiente
-- para decifrar o token — precisaria também da chave, que mora em outro
-- lugar.
--
-- pgp_sym_encrypt/pgp_sym_decrypt resolvidos como public.* (verificado
-- empiricamente contra um Postgres 17 real: "create extension pgcrypto"
-- sem cláusula SCHEMA, exatamente como a migration deste projeto já fez,
-- instala as funções em "public" por padrão) — search_path = '' em toda
-- função nova exige essa qualificação explícita de qualquer forma.
create type public.meta_conversion_value_mode as enum ('MRR', 'TCV');

create table public.meta_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id),
  pixel_id text,
  conversion_value_mode public.meta_conversion_value_mode not null default 'TCV',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()

  -- Sem CHECK cruzando para meta_integration_secrets aqui: Postgres não
  -- permite CHECK constraint referenciando outra tabela. A mesma regra
  -- ("não pode ativar sem pixel_id + token") passa a ser validada dentro
  -- de upsert_meta_integration (migration
  -- 20260907100310_create_meta_integration_functions.sql) antes do
  -- UPSERT — único caminho de escrita desta tabela de qualquer forma
  -- (RLS bloqueia INSERT/UPDATE direto do client).
);

create trigger meta_integrations_set_updated_at
  before update on public.meta_integrations
  for each row
  execute function public.set_updated_at();

alter table public.meta_integrations enable row level security;
-- Nenhuma policy: RLS habilitada sem policy nega acesso total via
-- PostgREST; leitura/escrita só através das funções SECURITY DEFINER
-- (get_meta_integration_settings/upsert_meta_integration).

-- organization_id como PK direta (não um "id" próprio + FK): a tabela é
-- inerentemente 1:1 com a organização, igual a meta_integrations — não há
-- necessidade de uma segunda chave substituta para algo que já tem uma
-- chave natural.
create table public.meta_integration_secrets (
  organization_id uuid primary key references public.organizations (id),
  access_token_encrypted bytea,
  updated_at timestamptz not null default now()
);

create trigger meta_integration_secrets_set_updated_at
  before update on public.meta_integration_secrets
  for each row
  execute function public.set_updated_at();

alter table public.meta_integration_secrets enable row level security;
-- Nenhuma policy — RLS habilitada sem nenhuma nega acesso total via
-- PostgREST (nem SELECT), mais restritivo ainda que meta_integrations:
-- nem sequer existe uma função que devolva esta tabela inteira, só uma
-- que decifra e usa o valor internamente (ver
-- 20260907100320_create_meta_secret_functions.sql). O client nunca tem
-- nenhum caminho — direto ou via RPC — para ler esta tabela.
