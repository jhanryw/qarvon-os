-- RPCs de configuração da integração Meta — restritas a ADMIN. Nenhuma das
-- duas jamais retorna o token (nem cifrado, nem decifrado): só
-- has_access_token (derivado de existir ou não uma linha com valor não
-- nulo em meta_integration_secrets) — cobre o requisito de nunca expor o
-- segredo em resposta de API, e nunca precisar de Client Component saber
-- se existe um token além do booleano.

-- ---------------------------------------------------------------------
-- get_meta_integration_settings: lê a configuração da própria organização.
-- Retorna uma linha com defaults quando a organização ainda não configurou
-- nada (nunca erro "not found" para esse caso — é o estado inicial
-- esperado).
-- ---------------------------------------------------------------------
create or replace function public.get_meta_integration_settings()
returns table (
  pixel_id text,
  conversion_value_mode public.meta_conversion_value_mode,
  active boolean,
  has_access_token boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_organization_id uuid;
  v_profile_active boolean;
  v_profile_role public.user_role;
begin
  v_profile_id := auth.uid();

  select organization_id, profiles.active, role
    into v_organization_id, v_profile_active, v_profile_role
    from public.profiles where id = v_profile_id;
  if v_organization_id is null or not v_profile_active then
    perform public.raise_qarvon_error('QARVON_NO_ACCESS');
  end if;
  if v_profile_role <> 'ADMIN' then
    perform public.raise_qarvon_error('QARVON_NO_ACCESS');
  end if;

  return query
    select
      mi.pixel_id,
      mi.conversion_value_mode,
      mi.active,
      exists (
        select 1 from public.meta_integration_secrets s
        where s.organization_id = v_organization_id and s.access_token_encrypted is not null
      )
    from public.meta_integrations mi
    where mi.organization_id = v_organization_id;

  if not found then
    return query select null::text, 'TCV'::public.meta_conversion_value_mode, false, false;
  end if;
end;
$$;

revoke execute on function public.get_meta_integration_settings() from public;
revoke execute on function public.get_meta_integration_settings() from anon;
revoke execute on function public.get_meta_integration_settings() from service_role;
grant execute on function public.get_meta_integration_settings() to authenticated;

-- ---------------------------------------------------------------------
-- upsert_meta_integration:
--   p_access_token nulo = "não alterar o token atual" (o form nunca
--   reenvia o valor de volta para o servidor — nem cifrado, muito menos em
--   texto puro — então não há valor para "reenviar" de propósito).
--   p_encryption_key só é usado nesta chamada, para cifrar p_access_token
--   antes de gravar — nunca persistido em lugar nenhum; vem do ambiente do
--   servidor Next.js (META_TOKEN_ENCRYPTION_KEY), repassado a cada request.
-- ---------------------------------------------------------------------
create or replace function public.upsert_meta_integration(
  p_pixel_id text,
  p_access_token text,
  p_encryption_key text,
  p_conversion_value_mode public.meta_conversion_value_mode,
  p_active boolean
) returns table (
  pixel_id text,
  conversion_value_mode public.meta_conversion_value_mode,
  active boolean,
  has_access_token boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_organization_id uuid;
  v_profile_active boolean;
  v_profile_role public.user_role;
  v_existing public.meta_integrations;
  v_has_existing_token boolean;
  v_final_pixel_id text;
  v_final_mode public.meta_conversion_value_mode;
  v_final_active boolean;
  v_has_token boolean;
  v_row public.meta_integrations;
begin
  v_profile_id := auth.uid();

  select organization_id, profiles.active, role
    into v_organization_id, v_profile_active, v_profile_role
    from public.profiles where id = v_profile_id;
  if v_organization_id is null or not v_profile_active then
    perform public.raise_qarvon_error('QARVON_NO_ACCESS');
  end if;
  if v_profile_role <> 'ADMIN' then
    perform public.raise_qarvon_error('QARVON_NO_ACCESS');
  end if;

  if p_access_token is not null and (p_encryption_key is null or length(p_encryption_key) = 0) then
    perform public.raise_qarvon_error('QARVON_INVALID_INPUT');
  end if;

  select * into v_existing
    from public.meta_integrations
    where organization_id = v_organization_id
    for update;

  select (access_token_encrypted is not null) into v_has_existing_token
    from public.meta_integration_secrets
    where organization_id = v_organization_id
    for update;

  -- v_existing/v_has_existing_token ficam NULL se "not found" — acessar um
  -- campo de um record NULL (ou uma variável boolean nunca atribuída)
  -- retorna NULL, não lança erro, então os coalesce() abaixo funcionam
  -- igual na primeira configuração e numa atualização.
  v_final_pixel_id := coalesce(p_pixel_id, v_existing.pixel_id);
  v_final_mode := coalesce(p_conversion_value_mode, v_existing.conversion_value_mode, 'TCV');
  v_final_active := coalesce(p_active, v_existing.active, false);
  v_has_token := (p_access_token is not null) or coalesce(v_has_existing_token, false);

  if v_final_active and (v_final_pixel_id is null or not v_has_token) then
    perform public.raise_qarvon_error('QARVON_META_CREDENTIALS_REQUIRED');
  end if;

  insert into public.meta_integrations (
    organization_id, pixel_id, conversion_value_mode, active
  ) values (
    v_organization_id, v_final_pixel_id, v_final_mode, v_final_active
  )
  on conflict (organization_id) do update
    set pixel_id = excluded.pixel_id,
        conversion_value_mode = excluded.conversion_value_mode,
        active = excluded.active
  returning * into v_row;

  if p_access_token is not null then
    insert into public.meta_integration_secrets (organization_id, access_token_encrypted)
    values (v_organization_id, public.pgp_sym_encrypt(p_access_token, p_encryption_key))
    on conflict (organization_id) do update
      set access_token_encrypted = excluded.access_token_encrypted,
          updated_at = now();
  end if;

  return query select v_row.pixel_id, v_row.conversion_value_mode, v_row.active, v_has_token;
end;
$$;

revoke execute on function public.upsert_meta_integration(text, text, text, public.meta_conversion_value_mode, boolean) from public;
revoke execute on function public.upsert_meta_integration(text, text, text, public.meta_conversion_value_mode, boolean) from anon;
revoke execute on function public.upsert_meta_integration(text, text, text, public.meta_conversion_value_mode, boolean) from service_role;
grant execute on function public.upsert_meta_integration(text, text, text, public.meta_conversion_value_mode, boolean) to authenticated;
