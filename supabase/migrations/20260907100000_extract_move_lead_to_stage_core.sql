-- Extrai de move_lead_to_stage (20260904002100) o miolo que resolve locks,
-- valida o destino e move o lead, para uma função privada reutilizável por
-- close_lead_won/close_lead_lost (migration
-- 20260907100300_create_close_lead_functions.sql) — mesmo racional já usado
-- para _create_lead_with_pipeline_core: uma única implementação da
-- movimentação real, nunca duas cópias divergentes.
--
-- p_organization_id/p_changed_by chegam já resolvidos pelo caller (cada
-- função resolve "quem sou eu" do seu próprio jeito — aqui sempre
-- auth.uid(), já que fechamento de negócio é sempre uma ação humana, nunca
-- de integração) — o core não os re-resolve, só os usa.
--
-- Sem grant para nenhuma role: mesma classe de raise_qarvon_error/
-- _create_lead_with_pipeline_core.
create or replace function public._move_lead_to_stage_core(
  p_organization_id uuid,
  p_lead_id uuid,
  p_target_stage_id uuid,
  p_changed_by uuid
) returns public.leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads;
  v_target_pipeline_id uuid;
  v_target_pipeline public.pipelines;
  v_target_stage public.pipeline_stages;
  v_from_pipeline_id uuid;
  v_from_stage_id uuid;
  v_from_position integer;
begin
  -- Lock 1 (lead): serializa dois movers concorrentes do mesmo lead.
  select * into v_lead
    from public.leads
    where id = p_lead_id and organization_id = p_organization_id
    for update;

  if not found then
    perform public.raise_qarvon_error('QARVON_LEAD_NOT_FOUND');
  end if;

  if (v_lead.pipeline_id is null) <> (v_lead.stage_id is null) then
    perform public.raise_qarvon_error('QARVON_INVARIANT_VIOLATION');
  end if;

  select pipeline_id into v_target_pipeline_id
    from public.pipeline_stages
    where id = p_target_stage_id and organization_id = p_organization_id;

  if not found then
    perform public.raise_qarvon_error('QARVON_STAGE_NOT_FOUND');
  end if;

  -- Lock 2 (pipeline de destino).
  select * into v_target_pipeline
    from public.pipelines
    where id = v_target_pipeline_id
    for share;

  -- Lock 3 (stage de destino).
  select * into v_target_stage
    from public.pipeline_stages
    where id = p_target_stage_id
    for share;

  -- No-op: confirmar a própria stage atual nunca falha.
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
    p_organization_id, p_lead_id,
    v_from_pipeline_id, v_from_stage_id, v_from_position,
    v_target_pipeline.id, v_target_stage.id, v_target_stage.position,
    p_changed_by, now()
  );

  return v_lead;
end;
$$;

revoke execute on function public._move_lead_to_stage_core(uuid, uuid, uuid, uuid) from public;
revoke execute on function public._move_lead_to_stage_core(uuid, uuid, uuid, uuid) from anon;
revoke execute on function public._move_lead_to_stage_core(uuid, uuid, uuid, uuid) from authenticated;
revoke execute on function public._move_lead_to_stage_core(uuid, uuid, uuid, uuid) from service_role;

-- move_lead_to_stage passa a delegar ao core depois de resolver
-- organization_id/profile — assinatura e comportamento externo idênticos.
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
begin
  v_profile_id := auth.uid();

  select organization_id, active
    into v_organization_id, v_profile_active
    from public.profiles
    where id = v_profile_id;

  if v_organization_id is null or not v_profile_active then
    perform public.raise_qarvon_error('QARVON_NO_ACCESS');
  end if;

  return public._move_lead_to_stage_core(
    v_organization_id, p_lead_id, p_target_stage_id, v_profile_id
  );
end;
$$;

revoke execute on function public.move_lead_to_stage(uuid, uuid) from public;
revoke execute on function public.move_lead_to_stage(uuid, uuid) from anon;
revoke execute on function public.move_lead_to_stage(uuid, uuid) from service_role;
grant execute on function public.move_lead_to_stage(uuid, uuid) to authenticated;
