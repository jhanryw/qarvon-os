-- Necessária como alvo da FK composta em leads.owner_id, garantindo que um
-- lead só pode ter como responsável um profile da própria organização
-- (integridade cross-tenant no banco, não só via RLS). Aditiva e segura:
-- id já é PK/único sozinho, então esta constraint não muda nenhum dado
-- nem comportamento existente.

alter table public.profiles
  add constraint profiles_id_organization_id_key unique (id, organization_id);
