-- Isolamento multi-tenant: nenhum acesso a dados de outra organização deve
-- depender de filtro no frontend. A função abaixo roda com SECURITY DEFINER
-- para poder ler a própria linha de profiles sem recursão de RLS.

create or replace function public.current_profile_organization_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select organization_id
  from public.profiles
  where id = auth.uid();
$$;

-- Restringe quem pode executar a função ao mínimo necessário: só a role
-- "authenticated" a usa (via policies de RLS). "anon" e demais roles públicas
-- não precisam dela — Postgres concede EXECUTE a PUBLIC por padrão em novas
-- funções, então isso precisa ser revogado explicitamente.
revoke execute on function public.current_profile_organization_id() from public;
grant execute on function public.current_profile_organization_id() to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;

-- organizations: cada usuário só enxerga a própria organização.
-- Escrita (criação/edição de organização) não é exposta a client roles neste M0.
create policy organizations_select_own
  on public.organizations
  for select
  to authenticated
  using (id = public.current_profile_organization_id());

-- profiles: cada usuário só enxerga profiles da própria organização.
-- Não há policy de insert/update/delete para authenticated: o vínculo de um
-- profile a uma organização é um passo administrativo explícito, feito via
-- service role (ver supabase/BOOTSTRAP.md), nunca pelo próprio client.
create policy profiles_select_same_organization
  on public.profiles
  for select
  to authenticated
  using (organization_id = public.current_profile_organization_id());
