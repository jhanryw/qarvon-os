-- Criação de lead já com pipeline/stage inicial + evento de bootstrap,
-- transacional (M2.2A). p_lead é tratado como input NÃO CONFIÁVEL: esta
-- função é SECURITY DEFINER com EXECUTE para "authenticated", logo é
-- chamável diretamente via PostgREST sem passar por createLead() — toda
-- validação de segurança/integridade relevante (whitelist de campos, owner
-- pertence ao tenant, source pertence ao tenant e está ativa, WhatsApp não
-- duplicado) precisa acontecer aqui dentro, não só no TypeScript que a
-- chama normalmente. TypeScript continua fazendo a mesma validação antes
-- (Zod, normalização, feedback de UX) — isso não é redundância proibida,
-- é a mesma regra em duas camadas com propósitos diferentes: UX vs.
-- fronteira de segurança real.
--
-- organization_id nunca é aceito (nem existe como chave esperada em
-- p_lead) — sempre resolvido a partir de auth.uid() -> profiles.
-- pipeline_id/stage_id nunca são aceitos do input — sempre resolvidos
-- internamente (pipeline default ativo + primeira stage OPEN ativa).
--
-- SET search_path = '': mesma justificativa da função de movimentação.
-- Ordem de lock (pipeline -> stage) consistente com move_lead_to_stage
-- (que usa lead -> pipeline -> stage; aqui não há lead ainda, então começa
-- no mesmo ponto da hierarquia onde move_lead_to_stage já estaria depois
-- de lockar o lead) — evita inversão de ordem entre as duas funções.

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
    'temperature', 'next_action', 'next_action_at'
  ];
  v_key text;
  v_pipeline public.pipelines;
  v_stage public.pipeline_stages;
  v_owner_id uuid;
  v_lead_source_id uuid;
  v_source_active boolean;
  v_whatsapp text;
  v_lead public.leads;
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

  -- Whitelist estrita: qualquer chave fora da lista (inclusive
  -- organization_id/pipeline_id/stage_id/id/created_at/updated_at) rejeita
  -- a chamada inteira antes de qualquer INSERT — nunca é ignorada em
  -- silêncio.
  for v_key in select jsonb_object_keys(p_lead) loop
    if not (v_key = any (v_allowed_keys)) then
      perform public.raise_qarvon_error('QARVON_INVALID_INPUT');
    end if;
  end loop;

  -- Lock (pipeline default): impede que a organização perca/troque o
  -- pipeline default entre a validação e o INSERT do lead.
  select * into v_pipeline
    from public.pipelines
    where organization_id = v_organization_id and is_default and active
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
    -- Pipeline default sem nenhuma stage OPEN ativa é tão inválido quanto
    -- não ter pipeline default — mesmo marcador, mesma severidade.
    perform public.raise_qarvon_error('QARVON_NO_DEFAULT_PIPELINE');
  end if;

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

  -- Duplicidade de WhatsApp: mesma checagem que assertWhatsappNotDuplicated
  -- já faz em TypeScript, reimplementada aqui para não ser pulável numa
  -- chamada direta. NÃO introduz UNIQUE — a mesma race condition já aceita
  -- no M1 (duas criações quase simultâneas com o mesmo WhatsApp podem ambas
  -- passar por este SELECT antes de qualquer INSERT commitar) continua
  -- possível, só que numa janela menor (dentro do corpo desta função, não
  -- mais entre duas chamadas de rede separadas). Fechar isso de vez exigiria
  -- UNIQUE ou um advisory lock — nenhum dos dois foi autorizado nesta etapa.
  v_whatsapp := p_lead->>'whatsapp';
  if v_whatsapp is not null then
    if exists (
      select 1 from public.leads
      where organization_id = v_organization_id and whatsapp = v_whatsapp
    ) then
      perform public.raise_qarvon_error('QARVON_DUPLICATE_WHATSAPP');
    end if;
  end if;

  insert into public.leads (
    organization_id, pipeline_id, stage_id,
    name, whatsapp, company, lead_source_id, owner_id, note,
    email, instagram, website, segment, city, state,
    service_interest, estimated_value, campaign, revenue_range,
    temperature, next_action, next_action_at
  ) values (
    v_organization_id, v_pipeline.id, v_stage.id,
    p_lead->>'name', v_whatsapp, p_lead->>'company', v_lead_source_id, v_owner_id, p_lead->>'note',
    p_lead->>'email', p_lead->>'instagram', p_lead->>'website', p_lead->>'segment', p_lead->>'city', p_lead->>'state',
    p_lead->>'service_interest', (p_lead->>'estimated_value')::numeric, p_lead->>'campaign', p_lead->>'revenue_range',
    (p_lead->>'temperature')::public.lead_temperature, p_lead->>'next_action', (p_lead->>'next_action_at')::timestamptz
  )
  returning * into v_lead;

  insert into public.lead_stage_history (
    organization_id, lead_id,
    from_pipeline_id, from_stage_id, from_position,
    to_pipeline_id, to_stage_id, to_position,
    changed_by, changed_at
  ) values (
    v_organization_id, v_lead.id,
    null, null, null,
    v_pipeline.id, v_stage.id, v_stage.position,
    v_profile_id, now()
  );

  return v_lead;
end;
$$;

revoke execute on function public.create_lead_with_pipeline(jsonb) from public;
revoke execute on function public.create_lead_with_pipeline(jsonb) from anon;
revoke execute on function public.create_lead_with_pipeline(jsonb) from service_role;
grant execute on function public.create_lead_with_pipeline(jsonb) to authenticated;
