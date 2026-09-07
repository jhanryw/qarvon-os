-- Gestão de stages pelo usuário (Configurações > Pipeline). Reaproveita
-- stage_type ('OPEN'/'WON'/'LOST') exatamente como já existe — nenhum
-- conceito novo de "Lead Novo"/"Ganho"/"Perdido" é criado: "Lead Novo" é
-- derivado (a stage OPEN de menor position do pipeline, mesmo critério já
-- usado por _create_lead_with_pipeline_core para escolher a stage inicial),
-- "Ganho"/"Perdido" são as stages WON/LOST ativas do pipeline (já
-- garantidas únicas pelos índices parciais de
-- 20260904001100_create_pipeline_stages.sql).
--
-- Todas as três stages estruturais (Lead Novo, WON, LOST) são protegidas
-- contra desativação/exclusão pelas funções abaixo — nunca por uma
-- constraint de banco nova (não há coluna "is_structural"; a proteção é
-- sempre derivada por consulta, para não duplicar o conceito).

-- ---------------------------------------------------------------------
-- create_pipeline_stage: nova stage intermediária (sempre OPEN), inserida
-- logo antes da stage WON do pipeline.
-- ---------------------------------------------------------------------
create or replace function public.create_pipeline_stage(
  p_pipeline_id uuid,
  p_name text
) returns public.pipeline_stages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_organization_id uuid;
  v_profile_active boolean;
  v_won_position integer;
  v_insert_position integer;
  v_stage public.pipeline_stages;
begin
  v_profile_id := auth.uid();

  select organization_id, active into v_organization_id, v_profile_active
    from public.profiles where id = v_profile_id;
  if v_organization_id is null or not v_profile_active then
    perform public.raise_qarvon_error('QARVON_NO_ACCESS');
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    perform public.raise_qarvon_error('QARVON_INVALID_INPUT');
  end if;

  if not exists (
    select 1 from public.pipelines
    where id = p_pipeline_id and organization_id = v_organization_id
    for share
  ) then
    perform public.raise_qarvon_error('QARVON_PIPELINE_NOT_FOUND');
  end if;

  -- Lock de todas as stages do pipeline antes de reposicionar — nenhuma
  -- outra criação/reordenação concorrente pode ver um estado parcial.
  perform 1 from public.pipeline_stages
    where pipeline_id = p_pipeline_id
    for update;

  select position into v_won_position
    from public.pipeline_stages
    where pipeline_id = p_pipeline_id and stage_type = 'WON'
    limit 1;

  if v_won_position is null then
    select coalesce(max(position), 0) + 1 into v_insert_position
      from public.pipeline_stages
      where pipeline_id = p_pipeline_id;
  else
    v_insert_position := v_won_position;
    -- Abre espaço deslocando WON/LOST (e qualquer stage a partir daqui) uma
    -- posição à frente. Seguro: UNIQUE(pipeline_id, position) é DEFERRABLE
    -- INITIALLY DEFERRED, a checagem só acontece no commit desta transação.
    update public.pipeline_stages
      set position = position + 1
      where pipeline_id = p_pipeline_id and position >= v_insert_position;
  end if;

  insert into public.pipeline_stages (
    organization_id, pipeline_id, name, position, probability, stage_type, active
  ) values (
    v_organization_id, p_pipeline_id, p_name, v_insert_position, 0, 'OPEN', true
  )
  returning * into v_stage;

  return v_stage;
end;
$$;

revoke execute on function public.create_pipeline_stage(uuid, text) from public;
revoke execute on function public.create_pipeline_stage(uuid, text) from anon;
revoke execute on function public.create_pipeline_stage(uuid, text) from service_role;
grant execute on function public.create_pipeline_stage(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- update_pipeline_stage: renomear e/ou ativar/desativar. p_name/p_active
-- nulos = "não alterar este campo" (name nunca é legitimamente nulo,
-- active é sempre true/false quando informado — NULL como "skip" não
-- colide com nenhum valor real de negócio).
-- ---------------------------------------------------------------------
create or replace function public.update_pipeline_stage(
  p_stage_id uuid,
  p_name text,
  p_active boolean
) returns public.pipeline_stages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_organization_id uuid;
  v_profile_active boolean;
  v_stage public.pipeline_stages;
  v_min_open_stage_id uuid;
  v_stage_out public.pipeline_stages;
begin
  v_profile_id := auth.uid();

  select organization_id, active into v_organization_id, v_profile_active
    from public.profiles where id = v_profile_id;
  if v_organization_id is null or not v_profile_active then
    perform public.raise_qarvon_error('QARVON_NO_ACCESS');
  end if;

  select * into v_stage
    from public.pipeline_stages
    where id = p_stage_id and organization_id = v_organization_id
    for update;
  if not found then
    perform public.raise_qarvon_error('QARVON_STAGE_NOT_FOUND');
  end if;

  if p_name is not null and length(trim(p_name)) = 0 then
    perform public.raise_qarvon_error('QARVON_INVALID_INPUT');
  end if;

  -- Desativar é bloqueado para as três stages estruturais: primeira OPEN
  -- (Lead Novo), WON e LOST.
  if p_active is false then
    select id into v_min_open_stage_id
      from public.pipeline_stages
      where pipeline_id = v_stage.pipeline_id and stage_type = 'OPEN'
      order by position asc
      limit 1;

    if v_stage.stage_type in ('WON', 'LOST') or v_stage.id = v_min_open_stage_id then
      perform public.raise_qarvon_error('QARVON_STAGE_PROTECTED');
    end if;
  end if;

  update public.pipeline_stages
    set name = coalesce(p_name, name),
        active = coalesce(p_active, active)
    where id = p_stage_id
    returning * into v_stage_out;

  return v_stage_out;
end;
$$;

revoke execute on function public.update_pipeline_stage(uuid, text, boolean) from public;
revoke execute on function public.update_pipeline_stage(uuid, text, boolean) from anon;
revoke execute on function public.update_pipeline_stage(uuid, text, boolean) from service_role;
grant execute on function public.update_pipeline_stage(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- reorder_pipeline_stages: reordena só as stages OPEN intermediárias
-- (todas as OPEN, exceto a de menor position = Lead Novo). O conjunto de
-- ids recebido precisa bater EXATAMENTE com o conjunto atual dessas
-- stages — nem a mais, nem a menos, sem duplicata. As posições numéricas
-- usadas são as mesmas já existentes, só permutadas entre as stages dadas
-- — nunca colide com Lead Novo/WON/LOST, que ficam fora do conjunto.
-- ---------------------------------------------------------------------
create or replace function public.reorder_pipeline_stages(
  p_pipeline_id uuid,
  p_stage_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_organization_id uuid;
  v_profile_active boolean;
  v_min_open_stage_id uuid;
  v_expected_count integer;
  v_given_count integer;
  v_distinct_count integer;
  v_positions integer[];
  v_index integer;
begin
  v_profile_id := auth.uid();

  select organization_id, active into v_organization_id, v_profile_active
    from public.profiles where id = v_profile_id;
  if v_organization_id is null or not v_profile_active then
    perform public.raise_qarvon_error('QARVON_NO_ACCESS');
  end if;

  if p_stage_ids is null or array_length(p_stage_ids, 1) is null then
    perform public.raise_qarvon_error('QARVON_INVALID_INPUT');
  end if;

  if not exists (
    select 1 from public.pipelines
    where id = p_pipeline_id and organization_id = v_organization_id
  ) then
    perform public.raise_qarvon_error('QARVON_PIPELINE_NOT_FOUND');
  end if;

  perform 1 from public.pipeline_stages
    where pipeline_id = p_pipeline_id
    for update;

  select id into v_min_open_stage_id
    from public.pipeline_stages
    where pipeline_id = p_pipeline_id and stage_type = 'OPEN'
    order by position asc
    limit 1;

  select count(*) into v_expected_count
    from public.pipeline_stages
    where pipeline_id = p_pipeline_id and stage_type = 'OPEN' and id <> v_min_open_stage_id;

  v_given_count := array_length(p_stage_ids, 1);
  select count(distinct x) into v_distinct_count from unnest(p_stage_ids) as x;

  if v_given_count <> v_expected_count or v_distinct_count <> v_given_count then
    perform public.raise_qarvon_error('QARVON_INVALID_INPUT');
  end if;

  if exists (
    select 1 from unnest(p_stage_ids) as given_id
    where not exists (
      select 1 from public.pipeline_stages ps
      where ps.id = given_id
        and ps.pipeline_id = p_pipeline_id
        and ps.stage_type = 'OPEN'
        and ps.id <> v_min_open_stage_id
    )
  ) then
    perform public.raise_qarvon_error('QARVON_INVALID_INPUT');
  end if;

  select array_agg(position order by position) into v_positions
    from public.pipeline_stages
    where pipeline_id = p_pipeline_id and stage_type = 'OPEN' and id <> v_min_open_stage_id;

  for v_index in 1 .. v_given_count loop
    update public.pipeline_stages
      set position = v_positions[v_index]
      where id = p_stage_ids[v_index];
  end loop;
end;
$$;

revoke execute on function public.reorder_pipeline_stages(uuid, uuid[]) from public;
revoke execute on function public.reorder_pipeline_stages(uuid, uuid[]) from anon;
revoke execute on function public.reorder_pipeline_stages(uuid, uuid[]) from service_role;
grant execute on function public.reorder_pipeline_stages(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- delete_pipeline_stage: só stages OPEN intermediárias (nunca Lead Novo,
-- WON ou LOST). Se houver leads na stage, exige p_reassign_to_stage_id
-- (outra OPEN do mesmo pipeline) e migra em bloco, preservando
-- auditabilidade (um evento de lead_stage_history por lead migrado, igual
-- a uma movimentação real). Nunca apaga lead. Tenta excluir a linha da
-- stage de verdade; se ela já tiver sido referenciada historicamente em
-- lead_stage_history (FK impede o DELETE), cai para desativação
-- (active = false) em vez de propagar o erro — nunca compromete
-- integridade referencial nem perde histórico.
-- ---------------------------------------------------------------------
create or replace function public.delete_pipeline_stage(
  p_stage_id uuid,
  p_reassign_to_stage_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_organization_id uuid;
  v_profile_active boolean;
  v_stage public.pipeline_stages;
  v_min_open_stage_id uuid;
  v_target public.pipeline_stages;
  v_lead_count integer;
begin
  v_profile_id := auth.uid();

  select organization_id, active into v_organization_id, v_profile_active
    from public.profiles where id = v_profile_id;
  if v_organization_id is null or not v_profile_active then
    perform public.raise_qarvon_error('QARVON_NO_ACCESS');
  end if;

  select * into v_stage
    from public.pipeline_stages
    where id = p_stage_id and organization_id = v_organization_id
    for update;
  if not found then
    perform public.raise_qarvon_error('QARVON_STAGE_NOT_FOUND');
  end if;

  if v_stage.stage_type <> 'OPEN' then
    perform public.raise_qarvon_error('QARVON_STAGE_PROTECTED');
  end if;

  select id into v_min_open_stage_id
    from public.pipeline_stages
    where pipeline_id = v_stage.pipeline_id and stage_type = 'OPEN'
    order by position asc
    limit 1;

  if v_stage.id = v_min_open_stage_id then
    perform public.raise_qarvon_error('QARVON_STAGE_PROTECTED');
  end if;

  select count(*) into v_lead_count from public.leads where stage_id = p_stage_id;

  if v_lead_count > 0 then
    if p_reassign_to_stage_id is null then
      perform public.raise_qarvon_error('QARVON_REASSIGN_STAGE_REQUIRED');
    end if;

    select * into v_target
      from public.pipeline_stages
      where id = p_reassign_to_stage_id
        and organization_id = v_organization_id
        and pipeline_id = v_stage.pipeline_id
      for share;
    if not found or v_target.stage_type <> 'OPEN' or v_target.id = p_stage_id then
      perform public.raise_qarvon_error('QARVON_INVALID_INPUT');
    end if;

    insert into public.lead_stage_history (
      organization_id, lead_id,
      from_pipeline_id, from_stage_id, from_position,
      to_pipeline_id, to_stage_id, to_position,
      changed_by, changed_at
    )
    select
      v_organization_id, l.id,
      v_stage.pipeline_id, v_stage.id, v_stage.position,
      v_target.pipeline_id, v_target.id, v_target.position,
      v_profile_id, now()
    from public.leads l
    where l.stage_id = p_stage_id;

    update public.leads
      set stage_id = p_reassign_to_stage_id
      where stage_id = p_stage_id;
  end if;

  begin
    delete from public.pipeline_stages where id = p_stage_id;
  exception
    when foreign_key_violation then
      update public.pipeline_stages set active = false where id = p_stage_id;
  end;
end;
$$;

revoke execute on function public.delete_pipeline_stage(uuid, uuid) from public;
revoke execute on function public.delete_pipeline_stage(uuid, uuid) from anon;
revoke execute on function public.delete_pipeline_stage(uuid, uuid) from service_role;
grant execute on function public.delete_pipeline_stage(uuid, uuid) to authenticated;
