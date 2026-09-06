-- Extrai de create_lead_with_pipeline (20260904002200) o miolo que resolve
-- pipeline default + primeira stage OPEN ativa (com lock) e insere o lead +
-- evento de bootstrap em lead_stage_history, para uma função privada nova
-- reutilizável pela integração de leads públicos
-- (create_lead_from_integration, migration
-- 20260906090700_create_create_lead_from_integration_function.sql).
--
-- Validação de negócio (whitelist de campos, owner pertence ao tenant,
-- source pertence ao tenant e está ativa, duplicidade de WhatsApp por
-- valor bruto) CONTINUA em create_lead_with_pipeline, inalterada — não
-- migra para o core. Motivo: create_lead_from_integration tem sua própria
-- estratégia de validação/deduplicação (por whatsapp_normalized + estágio
-- OPEN, sob advisory lock — ver função nova), diferente e não deve herdar
-- silenciosamente a checagem de duplicidade por valor bruto do caminho
-- humano. O core é só a parte que as duas formas de criar lead têm
-- IDENTICAMENTE em comum: resolver onde o lead entra no funil e registrar
-- o evento inicial.
--
-- p_lead_source_id/p_owner_id chegam PRÉ-VALIDADOS pelo caller (cada
-- caminho valida do seu próprio jeito) — o core não os reextrai de p_lead
-- nem os revalida, só os usa. p_changed_by é o profile de quem criou
-- (humano) ou NULL (integração/sistema — mesmo padrão já usado no evento
-- de bootstrap dos leads legados em M2.1); lead_stage_history exige NULL
-- ou um profile da mesma organização (constraint
-- lead_stage_history_changed_by_same_organization), então NULL é o único
-- valor correto quando não há usuário humano por trás da criação.
--
-- whatsapp_normalized é calculado aqui dentro (via _normalize_whatsapp_br),
-- não recebido como parâmetro: assim toda criação de lead que passar pelo
-- core — humana ou por integração, hoje ou no futuro — ganha o valor
-- normalizado automaticamente, sem exigir que cada caller lembre de
-- calculá-lo.
--
-- Sem grant para nenhuma role: mesma classe de raise_qarvon_error — só
-- chamável de dentro de outra função SECURITY DEFINER.
create or replace function public._create_lead_with_pipeline_core(
  p_organization_id uuid,
  p_lead_source_id uuid,
  p_owner_id uuid,
  p_changed_by uuid,
  p_lead jsonb
) returns public.leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pipeline public.pipelines;
  v_stage public.pipeline_stages;
  v_lead public.leads;
begin
  -- Lock (pipeline default): impede que a organização perca/troque o
  -- pipeline default entre a validação e o INSERT do lead.
  select * into v_pipeline
    from public.pipelines
    where organization_id = p_organization_id and is_default and active
    for share;

  if not found then
    perform public.raise_qarvon_error('QARVON_NO_DEFAULT_PIPELINE');
  end if;

  -- Lock (primeira stage OPEN ativa): mesma proteção para a decisão de
  -- qual stage inicial usar.
  select * into v_stage
    from public.pipeline_stages
    where pipeline_id = v_pipeline.id and stage_type = 'OPEN' and active
    order by position asc
    limit 1
    for share;

  if not found then
    perform public.raise_qarvon_error('QARVON_NO_DEFAULT_PIPELINE');
  end if;

  insert into public.leads (
    organization_id, pipeline_id, stage_id,
    name, whatsapp, whatsapp_normalized, company, lead_source_id, owner_id, note,
    email, instagram, website, segment, city, state,
    service_interest, estimated_value, campaign, revenue_range,
    temperature, next_action, next_action_at, invests_paid_traffic
  ) values (
    p_organization_id, v_pipeline.id, v_stage.id,
    p_lead->>'name', p_lead->>'whatsapp', public._normalize_whatsapp_br(p_lead->>'whatsapp'),
    p_lead->>'company', p_lead_source_id, p_owner_id, p_lead->>'note',
    p_lead->>'email', p_lead->>'instagram', p_lead->>'website', p_lead->>'segment', p_lead->>'city', p_lead->>'state',
    p_lead->>'service_interest', (p_lead->>'estimated_value')::numeric, p_lead->>'campaign', p_lead->>'revenue_range',
    (p_lead->>'temperature')::public.lead_temperature, p_lead->>'next_action', (p_lead->>'next_action_at')::timestamptz,
    (p_lead->>'invests_paid_traffic')::boolean
  )
  returning * into v_lead;

  insert into public.lead_stage_history (
    organization_id, lead_id,
    from_pipeline_id, from_stage_id, from_position,
    to_pipeline_id, to_stage_id, to_position,
    changed_by, changed_at
  ) values (
    p_organization_id, v_lead.id,
    null, null, null,
    v_pipeline.id, v_stage.id, v_stage.position,
    p_changed_by, now()
  );

  return v_lead;
end;
$$;

revoke execute on function public._create_lead_with_pipeline_core(uuid, uuid, uuid, uuid, jsonb) from public;
revoke execute on function public._create_lead_with_pipeline_core(uuid, uuid, uuid, uuid, jsonb) from anon;
revoke execute on function public._create_lead_with_pipeline_core(uuid, uuid, uuid, uuid, jsonb) from authenticated;
revoke execute on function public._create_lead_with_pipeline_core(uuid, uuid, uuid, uuid, jsonb) from service_role;

-- create_lead_with_pipeline passa a delegar a este core depois de fazer sua
-- própria validação (inalterada, exceto pela whitelist ganhar
-- invests_paid_traffic — campo novo, nullable, mesmo tratamento de
-- qualquer outro campo opcional já existente). Assinatura e comportamento
-- externo continuam idênticos; só o corpo muda.
create or replace function public.create_lead_with_pipeline(p_lead jsonb)
returns public.leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_organization_id uuid;
  v_profile_active boolean;
  v_allowed_keys text[] := array[
    'name', 'whatsapp', 'company', 'lead_source_id', 'owner_id', 'note',
    'email', 'instagram', 'website', 'segment', 'city', 'state',
    'service_interest', 'estimated_value', 'campaign', 'revenue_range',
    'temperature', 'next_action', 'next_action_at', 'invests_paid_traffic'
  ];
  v_key text;
  v_owner_id uuid;
  v_lead_source_id uuid;
  v_source_active boolean;
  v_whatsapp text;
begin
  v_profile_id := auth.uid();

  select organization_id, active
    into v_organization_id, v_profile_active
    from public.profiles
    where id = v_profile_id;

  if v_organization_id is null or not v_profile_active then
    perform public.raise_qarvon_error('QARVON_NO_ACCESS');
  end if;

  if p_lead is null or jsonb_typeof(p_lead) <> 'object' then
    perform public.raise_qarvon_error('QARVON_INVALID_INPUT');
  end if;

  for v_key in select jsonb_object_keys(p_lead) loop
    if not (v_key = any (v_allowed_keys)) then
      perform public.raise_qarvon_error('QARVON_INVALID_INPUT');
    end if;
  end loop;

  v_owner_id := (p_lead->>'owner_id')::uuid;
  if v_owner_id is not null then
    if not exists (
      select 1 from public.profiles
      where id = v_owner_id and organization_id = v_organization_id
    ) then
      perform public.raise_qarvon_error('QARVON_INVALID_OWNER');
    end if;
  end if;

  v_lead_source_id := (p_lead->>'lead_source_id')::uuid;
  if v_lead_source_id is not null then
    select active into v_source_active
      from public.lead_sources
      where id = v_lead_source_id and organization_id = v_organization_id;

    if not found then
      perform public.raise_qarvon_error('QARVON_INVALID_LEAD_SOURCE');
    end if;
    if not v_source_active then
      perform public.raise_qarvon_error('QARVON_INVALID_LEAD_SOURCE');
    end if;
  end if;

  -- Duplicidade de WhatsApp: comparação pelo valor bruto, exatamente como
  -- antes da extração do core — comportamento humano não muda nesta
  -- migration.
  v_whatsapp := p_lead->>'whatsapp';
  if v_whatsapp is not null then
    if exists (
      select 1 from public.leads
      where organization_id = v_organization_id and whatsapp = v_whatsapp
    ) then
      perform public.raise_qarvon_error('QARVON_DUPLICATE_WHATSAPP');
    end if;
  end if;

  return public._create_lead_with_pipeline_core(
    v_organization_id, v_lead_source_id, v_owner_id, v_profile_id, p_lead
  );
end;
$$;

revoke execute on function public.create_lead_with_pipeline(jsonb) from public;
revoke execute on function public.create_lead_with_pipeline(jsonb) from anon;
revoke execute on function public.create_lead_with_pipeline(jsonb) from service_role;
grant execute on function public.create_lead_with_pipeline(jsonb) to authenticated;
