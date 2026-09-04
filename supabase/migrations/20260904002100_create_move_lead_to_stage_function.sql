-- Movimentação de lead entre estágios, transacional (M2.2A). Nenhum caller
-- pode fazer isso como duas operações independentes (UPDATE leads + INSERT
-- lead_stage_history) — só esta função, dentro de uma única transação
-- implícita do corpo PL/pgSQL, com locking explícito sobre o que a decisão
-- depende.
--
-- SECURITY DEFINER porque authenticated não tem policy de INSERT em
-- lead_stage_history (de propósito, ver M2.1) — a função roda com os
-- privilégios do owner (que contorna RLS), então a partir daqui a proteção
-- de tenant deixa de ser a RLS e passa a ser inteiramente a lógica abaixo:
-- organization_id nunca é aceito como parâmetro, é sempre resolvido a
-- partir de auth.uid() -> profiles.
--
-- SET search_path = '' (não "public"): toda referência a objeto de schema
-- de usuário é qualificada explicitamente (public.*, auth.uid()) — só
-- built-ins do pg_catalog (now(), casts, etc.) ficam implícitos, e
-- pg_catalog é sempre pesquisado independente do search_path configurado.
--
-- Ordem de lock fixa (lead -> pipeline -> stage), para nunca inverter em
-- relação a qualquer código futuro que também precise lockar mais de um
-- desses recursos — evita deadlock por espera circular entre transações
-- concorrentes. FOR SHARE (não FOR UPDATE) em pipelines/pipeline_stages:
-- esta função nunca escreve nessas duas tabelas, só precisa impedir que a
-- decisão (active/position) fique obsoleta entre a validação e a escrita;
-- FOR SHARE barra UPDATE/DELETE/FOR UPDATE concorrentes sobre a mesma linha
-- mas não bloqueia outros leitores (incluindo outras chamadas concorrentes
-- desta mesma função validando a mesma stage) — o menor lock suficiente.

create or replace function public.move_lead_to_stage(
  p_lead_id uuid,
  p_target_stage_id uuid
)
returns public.leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_organization_id uuid;
  v_profile_active boolean;
  v_lead public.leads;
  v_target_pipeline_id uuid;
  v_target_pipeline public.pipelines;
  v_target_stage public.pipeline_stages;
  v_from_pipeline_id uuid;
  v_from_stage_id uuid;
  v_from_position integer;
begin
  v_profile_id := auth.uid();

  select organization_id, active
    into v_organization_id, v_profile_active
    from public.profiles
    where id = v_profile_id;

  if v_organization_id is null or not v_profile_active then
    perform public.raise_qarvon_error('QARVON_NO_ACCESS');
  end if;

  -- Lock 1 (lead): serializa dois movers concorrentes do mesmo lead — o
  -- segundo só lê o estado depois que o primeiro commitou, então
  -- from_stage_id sempre reflete a sequência real, nunca uma leitura obsoleta.
  select * into v_lead
    from public.leads
    where id = p_lead_id and organization_id = v_organization_id
    for update;

  if not found then
    -- Cross-tenant é indistinguível de inexistente, de propósito.
    perform public.raise_qarvon_error('QARVON_LEAD_NOT_FOUND');
  end if;

  -- Estado parcial (só um dos dois nulo) é inconsistência de dado, nunca
  -- tratado como bootstrap silenciosamente — ver nota no design aprovado.
  if (v_lead.pipeline_id is null) <> (v_lead.stage_id is null) then
    perform public.raise_qarvon_error('QARVON_INVARIANT_VIOLATION');
  end if;

  -- pipeline_id de uma stage é imutável (trigger do M2.1) — ler sem lock
  -- aqui é seguro, não pode mudar sob nós; só precisamos dele para saber
  -- qual pipeline lockar primeiro, respeitando a ordem fixa lead -> pipeline
  -- -> stage antes de lockar a própria stage.
  select pipeline_id into v_target_pipeline_id
    from public.pipeline_stages
    where id = p_target_stage_id and organization_id = v_organization_id;

  if not found then
    perform public.raise_qarvon_error('QARVON_STAGE_NOT_FOUND');
  end if;

  -- Lock 2 (pipeline de destino).
  select * into v_target_pipeline
    from public.pipelines
    where id = v_target_pipeline_id
    for share;

  -- Lock 3 (stage de destino) — recarrega com active/position sob lock.
  select * into v_target_stage
    from public.pipeline_stages
    where id = p_target_stage_id
    for share;

  -- No-op: confirmar a própria stage atual nunca falha, mesmo se ela (ou o
  -- pipeline dela) tiver sido desativada depois — nada está "recebendo"
  -- movimento porque não há movimento nenhum. Sem UPDATE, sem history.
  if v_lead.stage_id = p_target_stage_id then
    return v_lead;
  end if;

  if not v_target_pipeline.active then
    perform public.raise_qarvon_error('QARVON_PIPELINE_INACTIVE');
  end if;

  if not v_target_stage.active then
    perform public.raise_qarvon_error('QARVON_STAGE_INACTIVE');
  end if;

  v_from_pipeline_id := v_lead.pipeline_id;
  v_from_stage_id := v_lead.stage_id;

  if v_from_stage_id is not null then
    select position into v_from_position
      from public.pipeline_stages
      where id = v_from_stage_id;
  end if;

  update public.leads
    set pipeline_id = v_target_pipeline.id,
        stage_id = v_target_stage.id
    where id = p_lead_id
    returning * into v_lead;

  insert into public.lead_stage_history (
    organization_id, lead_id,
    from_pipeline_id, from_stage_id, from_position,
    to_pipeline_id, to_stage_id, to_position,
    changed_by, changed_at
  ) values (
    v_organization_id, p_lead_id,
    v_from_pipeline_id, v_from_stage_id, v_from_position,
    v_target_pipeline.id, v_target_stage.id, v_target_stage.position,
    v_profile_id, now()
  );

  return v_lead;
end;
$$;

revoke execute on function public.move_lead_to_stage(uuid, uuid) from public;
revoke execute on function public.move_lead_to_stage(uuid, uuid) from anon;
revoke execute on function public.move_lead_to_stage(uuid, uuid) from service_role;
grant execute on function public.move_lead_to_stage(uuid, uuid) to authenticated;
