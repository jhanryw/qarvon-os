-- Cria (ou reaproveita) um lead a partir de uma integração externa sem
-- sessão humana (ex.: LP pública), com idempotência, deduplicação por
-- WhatsApp e reaproveitamento do mesmo núcleo transacional que
-- create_lead_with_pipeline usa para leads criados por humanos.
--
-- p_integration_credential_id é a ÚNICA forma de dizer "quem está
-- chamando" — organization_id NUNCA é aceito como parâmetro, exatamente
-- como create_lead_with_pipeline nunca aceita organization_id e sempre
-- resolve via auth.uid() -> profiles. Aqui, na ausência de sessão humana,
-- "quem sou eu" é resolvido a partir da credencial, sempre por dentro desta
-- função — não existe caminho de código em que um chamador possa "escolher"
-- a organização, mesmo tentando.
--
-- SECURITY DEFINER + EXECUTE só para service_role (ver grants ao final):
-- só o próprio backend do Qarvon OS chama esta função, depois de já ter
-- autenticado a credencial pelo hash do token (lib/integrations/leads/auth.ts,
-- fora desta migration). A chave service_role nunca é entregue a nenhuma
-- integração externa, então o fato desta função ficar tecnicamente exposta
-- via PostgREST não muda o vetor de acesso real — mesmo raciocínio já
-- documentado no cabeçalho de create_lead_with_pipeline sobre PostgREST.
--
-- Fluxo (ver docs da decisão de concorrência):
--   1) valida input e resolve a credencial (nunca confia em organization_id
--      de fora);
--   2) checa idempotência por (integration_credential_id,
--      external_submission_id) ANTES de qualquer lock — não depende dele;
--   3) normaliza o WhatsApp;
--   4) adquire pg_advisory_xact_lock por organização + WhatsApp normalizado
--      — serializa duas submissões concorrentes do mesmo WhatsApp mesmo com
--      external_submission_id diferentes; liberada automaticamente no fim
--      desta transação;
--   5) só então busca um lead OPEN existente com o mesmo WhatsApp — se
--      achar, reaproveita (retorno, sem mexer em pipeline/stage/histórico);
--      se não achar (nenhum lead, ou só WON/LOST — nenhum dos dois é
--      reaberto automaticamente), cria um lead novo via
--      _create_lead_with_pipeline_core;
--   6) grava lead_submissions (protegido por UNIQUE físico, com tratamento
--      explícito de corrida via unique_violation) e lead_attribution.
create or replace function public.create_lead_from_integration(
  p_integration_credential_id uuid,
  p_external_submission_id text,
  p_lead jsonb,
  p_attribution jsonb,
  p_raw_payload jsonb
) returns table (
  lead_id uuid,
  submission_id uuid,
  is_new_lead boolean,
  duplicate_submission boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.integration_credentials;
  v_allowed_lead_keys text[] := array[
    'name', 'whatsapp', 'company', 'revenue_range', 'invests_paid_traffic'
  ];
  v_key text;
  v_found_submission_id uuid;
  v_found_lead_id uuid;
  v_found_is_new_lead boolean;
  v_whatsapp_normalized text;
  v_existing_lead_id uuid;
  v_lead public.leads;
  v_lead_id uuid;
  v_is_new_lead boolean;
  v_submission_id uuid;
begin
  if p_external_submission_id is null or length(trim(p_external_submission_id)) = 0 then
    perform public.raise_qarvon_error('QARVON_INVALID_INPUT');
  end if;

  if p_lead is null or jsonb_typeof(p_lead) <> 'object' then
    perform public.raise_qarvon_error('QARVON_INVALID_INPUT');
  end if;

  -- Whitelist estrita: bem menor que a de create_lead_with_pipeline de
  -- propósito — campos de enriquecimento (note, email, segment, etc.) não
  -- fazem parte do contrato desta integração, são preenchidos depois via
  -- CRM. Nunca aceita lead_source_id/owner_id/pipeline_id/stage_id/
  -- organization_id do payload — resolvidos só internamente.
  for v_key in select jsonb_object_keys(p_lead) loop
    if not (v_key = any (v_allowed_lead_keys)) then
      perform public.raise_qarvon_error('QARVON_INVALID_INPUT');
    end if;
  end loop;

  select * into v_credential
    from public.integration_credentials
    where id = p_integration_credential_id;

  if not found or not v_credential.active then
    perform public.raise_qarvon_error('QARVON_INVALID_CREDENTIAL');
  end if;

  -- Idempotência primeiro — chave própria (credencial + external id), não
  -- depende da advisory lock de WhatsApp.
  select ls.id, ls.lead_id, ls.is_new_lead
    into v_found_submission_id, v_found_lead_id, v_found_is_new_lead
    from public.lead_submissions ls
    where ls.integration_credential_id = v_credential.id
      and ls.external_submission_id = p_external_submission_id;

  if found then
    return query select v_found_lead_id, v_found_submission_id, v_found_is_new_lead, true;
    return;
  end if;

  v_whatsapp_normalized := public._normalize_whatsapp_br(p_lead->>'whatsapp');

  if v_whatsapp_normalized is null then
    perform public.raise_qarvon_error('QARVON_INVALID_WHATSAPP');
  end if;

  -- Advisory lock transacional por organização + WhatsApp normalizado —
  -- ver 20260906090100_create_lead_whatsapp_lock_key_function.sql. Liberada
  -- automaticamente no commit/rollback desta transação; cada chamada desta
  -- função via RPC já É uma transação completa.
  perform pg_advisory_xact_lock(
    public._lead_whatsapp_lock_key(v_credential.organization_id, v_whatsapp_normalized)
  );

  -- Só agora a busca por lead OPEN é segura contra concorrência: nenhuma
  -- outra transação para a mesma organização+whatsapp pode estar decidindo
  -- a mesma coisa ao mesmo tempo.
  select l.id into v_existing_lead_id
    from public.leads l
    join public.pipeline_stages ps on ps.id = l.stage_id
    where l.organization_id = v_credential.organization_id
      and l.whatsapp_normalized = v_whatsapp_normalized
      and ps.stage_type = 'OPEN'
    order by l.created_at desc
    limit 1
    for update of l;

  if found then
    -- Lead retornando: nunca move de estágio, nunca cria histórico novo.
    update public.leads
      set last_intake_at = now()
      where id = v_existing_lead_id;

    v_lead_id := v_existing_lead_id;
    v_is_new_lead := false;
  else
    -- Lead novo: nenhum OPEN encontrado (nenhum lead com este WhatsApp, ou
    -- só WON/LOST — nenhum dos dois é reaberto automaticamente).
    v_lead := public._create_lead_with_pipeline_core(
      v_credential.organization_id,
      v_credential.default_lead_source_id,
      null,
      null,
      p_lead
    );
    v_lead_id := v_lead.id;
    v_is_new_lead := true;
  end if;

  begin
    insert into public.lead_submissions (
      organization_id, lead_id, integration_credential_id,
      external_submission_id, is_new_lead, raw_payload
    ) values (
      v_credential.organization_id, v_lead_id, v_credential.id,
      p_external_submission_id, v_is_new_lead, p_raw_payload
    )
    returning id into v_submission_id;
  exception
    when unique_violation then
      -- Corrida real em external_submission_id (dois requests idênticos
      -- simultâneos) — a pré-checagem de idempotência acima não pega isso
      -- porque é só um SELECT sem lock. Recupera a linha que ganhou a
      -- corrida em vez de propagar o erro.
      select ls.id, ls.lead_id, ls.is_new_lead
        into v_submission_id, v_lead_id, v_is_new_lead
        from public.lead_submissions ls
        where ls.integration_credential_id = v_credential.id
          and ls.external_submission_id = p_external_submission_id;

      return query select v_lead_id, v_submission_id, v_is_new_lead, true;
      return;
  end;

  insert into public.lead_attribution (
    organization_id, submission_id,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    fbclid, fbp, fbc, campaign_id, adset_id, ad_id, gclid, gbraid, wbraid,
    landing_page, referrer
  ) values (
    v_credential.organization_id, v_submission_id,
    p_attribution->>'utm_source', p_attribution->>'utm_medium', p_attribution->>'utm_campaign',
    p_attribution->>'utm_content', p_attribution->>'utm_term',
    p_attribution->>'fbclid', p_attribution->>'fbp', p_attribution->>'fbc',
    p_attribution->>'campaign_id', p_attribution->>'adset_id', p_attribution->>'ad_id',
    p_attribution->>'gclid', p_attribution->>'gbraid', p_attribution->>'wbraid',
    p_attribution->>'landing_page', p_attribution->>'referrer'
  );

  return query select v_lead_id, v_submission_id, v_is_new_lead, false;
end;
$$;

revoke execute on function public.create_lead_from_integration(uuid, text, jsonb, jsonb, jsonb) from public;
revoke execute on function public.create_lead_from_integration(uuid, text, jsonb, jsonb, jsonb) from anon;
revoke execute on function public.create_lead_from_integration(uuid, text, jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.create_lead_from_integration(uuid, text, jsonb, jsonb, jsonb) to service_role;
