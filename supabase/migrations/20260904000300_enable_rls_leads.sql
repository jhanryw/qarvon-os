-- Isolamento multi-tenant de lead_sources e leads. Diferente de
-- organizations/profiles (M0), aqui authenticated realmente escreve — é o
-- primeiro caso de operação normal via RLS em vez de service role, conforme
-- decidido para o CRM. ADMIN e SALES têm o mesmo acesso neste M1: o
-- isolamento é por organização, não por role nem por owner.

alter table public.lead_sources enable row level security;
alter table public.leads enable row level security;

-- lead_sources: qualquer membro autenticado da organização gerencia as
-- próprias origens. Sem policy de DELETE — desativar via "active = false".
create policy lead_sources_select_own_org
  on public.lead_sources
  for select
  to authenticated
  using (organization_id = public.current_profile_organization_id());

create policy lead_sources_insert_own_org
  on public.lead_sources
  for insert
  to authenticated
  with check (organization_id = public.current_profile_organization_id());

create policy lead_sources_update_own_org
  on public.lead_sources
  for update
  to authenticated
  using (organization_id = public.current_profile_organization_id())
  with check (organization_id = public.current_profile_organization_id());

-- leads: mesma regra de organização. O "with check" no UPDATE impede mover
-- um lead para outra organização trocando organization_id. Sem policy de
-- DELETE — nunca excluir leads (histórico comercial); arquivamento por
-- estágio (LOST) é modelado no M2, não aqui.
create policy leads_select_own_org
  on public.leads
  for select
  to authenticated
  using (organization_id = public.current_profile_organization_id());

create policy leads_insert_own_org
  on public.leads
  for insert
  to authenticated
  with check (organization_id = public.current_profile_organization_id());

create policy leads_update_own_org
  on public.leads
  for update
  to authenticated
  using (organization_id = public.current_profile_organization_id())
  with check (organization_id = public.current_profile_organization_id());
