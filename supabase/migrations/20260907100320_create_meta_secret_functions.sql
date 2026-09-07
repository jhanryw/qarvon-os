-- get_meta_access_token: único caminho de leitura do token em texto puro —
-- decifra meta_integration_secrets.access_token_encrypted com a chave
-- recebida (nunca armazenada, só usada nesta chamada) e retorna o valor.
-- Chamável SÓ por service_role (dispatchWonConversion/retry, via
-- createAdminClient() — nunca por sessão de usuário comum, nunca via
-- Client Component, nunca em resposta serializada de Server Component).
--
-- Sem checagem de auth.uid()/profile de propósito: esta função não é
-- alcançável por nenhuma sessão humana (revoke de anon/authenticated
-- abaixo) — mesma postura de create_lead_from_integration, que também não
-- valida sessão porque só service_role a executa.
--
-- pgp_sym_decrypt com chave errada lança exceção (comportamento do
-- pgcrypto, não silencioso) — o caller (lib/integrations/meta/dispatch.ts)
-- trata isso como qualquer outra falha de envio: marca o conversion_event
-- como FAILED com o erro, nunca propaga para desfazer o fechamento.
create or replace function public.get_meta_access_token(
  p_organization_id uuid,
  p_encryption_key text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_encrypted bytea;
begin
  select access_token_encrypted into v_encrypted
    from public.meta_integration_secrets
    where organization_id = p_organization_id;

  if v_encrypted is null then
    return null;
  end if;

  return public.pgp_sym_decrypt(v_encrypted, p_encryption_key);
end;
$$;

revoke execute on function public.get_meta_access_token(uuid, text) from public;
revoke execute on function public.get_meta_access_token(uuid, text) from anon;
revoke execute on function public.get_meta_access_token(uuid, text) from authenticated;
grant execute on function public.get_meta_access_token(uuid, text) to service_role;
