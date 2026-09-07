-- Fechamento de negócio (WON) e perda (LOST) — sempre ações humanas
-- (resolvem organização via auth.uid(), nunca chamadas pela integração
-- pública). Ambas reaproveitam _move_lead_to_stage_core para a
-- movimentação real (mesmos locks, mesmo lead_stage_history, mesma
-- auditabilidade de move_lead_to_stage) e adicionam, na MESMA transação,
-- o efeito de domínio específico (deal ou motivo de perda). Nenhuma
-- integração externa (Meta CAPI) roda aqui dentro — isso é
-- responsabilidade do TypeScript, depois que a transação já commitou (ver
-- lib/integrations/meta/*), exatamente para não fazer o fechamento
-- depender de um serviço de terceiro.

-- ---------------------------------------------------------------------
-- close_lead_won: move para uma stage WON + registra o negócio (upsert em
-- deals). Reenviar com valores diferentes para um lead já WON CORRIGE o
-- deal existente (mrr/tcv/note), sem tentar mover de novo (no-op) nem
-- criar um segundo deal — unique(lead_id) più upsert cobre os dois casos
-- (fechar pela primeira vez e corrigir depois) com o mesmo código.
-- ---------------------------------------------------------------------
create or replace function public.close_lead_won(
  p_lead_id uuid,
  p_target_stage_id uuid,
  p_mrr numeric,
  p_tcv numeric,
  p_note text
) returns table (
  lead_id uuid,
  deal_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_organization_id uuid;
  v_profile_active boolean;
  v_target_stage public.pipeline_stages;
  v_lead public.leads;
  v_deal_id uuid;
begin
  v_profile_id := auth.uid();

  select organization_id, active into v_organization_id, v_profile_active
    from public.profiles where id = v_profile_id;
  if v_organization_id is null or not v_profile_active then
    perform public.raise_qarvon_error('QARVON_NO_ACCESS');
  end if;

  if p_mrr is null and p_tcv is null then
    perform public.raise_qarvon_error('QARVON_DEAL_VALUE_REQUIRED');
  end if;
  if (p_mrr is not null and p_mrr < 0) or (p_tcv is not null and p_tcv < 0) then
    perform public.raise_qarvon_error('QARVON_INVALID_INPUT');
  end if;

  select * into v_target_stage
    from public.pipeline_stages
    where id = p_target_stage_id and organization_id = v_organization_id;
  if not found then
    perform public.raise_qarvon_error('QARVON_STAGE_NOT_FOUND');
  end if;
  if v_target_stage.stage_type <> 'WON' then
    perform public.raise_qarvon_error('QARVON_INVALID_INPUT');
  end if;

  v_lead := public._move_lead_to_stage_core(
    v_organization_id, p_lead_id, p_target_stage_id, v_profile_id
  );

  -- ON CONFLICT ON CONSTRAINT (não a lista de colunas) de propósito: esta
  -- função RETURNS TABLE(lead_id uuid, deal_id uuid), e PL/pgSQL cria
  -- automaticamente variáveis com esses mesmos nomes — "on conflict
  -- (lead_id)" ficaria ambíguo entre a coluna de public.deals e a variável
  -- implícita. Achado rodando de verdade contra Postgres (não capturado
  -- por revisão estática): "column reference lead_id is ambiguous".
  -- Referenciar pelo nome da constraint evita a resolução de identificador
  -- que causava o conflito.
  insert into public.deals (
    organization_id, lead_id, mrr, tcv, note, closed_by
  ) values (
    v_organization_id, p_lead_id, p_mrr, p_tcv, p_note, v_profile_id
  )
  on conflict on constraint deals_lead_id_key do update
    set mrr = excluded.mrr,
        tcv = excluded.tcv,
        note = excluded.note,
        updated_at = now()
  returning id into v_deal_id;

  -- PENDING de conversão para Meta, sem duplicar entre correções: o
  -- primeiro fechamento cria o pendente; reenvios que só corrigem
  -- mrr/tcv/note não geram um segundo evento (ver
  -- 20260907100240_create_conversion_events.sql para o desenho completo de
  -- idempotência). Disparo real fica inteiramente no TypeScript, depois
  -- desta transação já ter commitado. Mesma razão acima para usar
  -- ON CONSTRAINT em vez da lista de colunas (deal_id colide com a
  -- variável implícita do RETURNS TABLE).
  insert into public.conversion_events (organization_id, deal_id, event_name)
  values (v_organization_id, v_deal_id, 'Purchase')
  on conflict on constraint conversion_events_deal_event_key do nothing;

  return query select v_lead.id, v_deal_id;
end;
$$;

revoke execute on function public.close_lead_won(uuid, uuid, numeric, numeric, text) from public;
revoke execute on function public.close_lead_won(uuid, uuid, numeric, numeric, text) from anon;
revoke execute on function public.close_lead_won(uuid, uuid, numeric, numeric, text) from service_role;
grant execute on function public.close_lead_won(uuid, uuid, numeric, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- close_lead_lost: move para uma stage LOST + registra motivo/observação
-- diretamente em leads (ver justificativa em
-- 20260907100210_create_lost_reasons.sql). p_lost_reason_id nullable —
-- motivo é fortemente recomendado pela UI, mas não é uma trava de banco:
-- a mesma flexibilidade que qualquer FK opcional já tem no projeto
-- (ex.: leads.lead_source_id).
-- ---------------------------------------------------------------------
create or replace function public.close_lead_lost(
  p_lead_id uuid,
  p_target_stage_id uuid,
  p_lost_reason_id uuid,
  p_lost_note text
) returns public.leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_organization_id uuid;
  v_profile_active boolean;
  v_target_stage public.pipeline_stages;
  v_lead public.leads;
begin
  v_profile_id := auth.uid();

  select organization_id, active into v_organization_id, v_profile_active
    from public.profiles where id = v_profile_id;
  if v_organization_id is null or not v_profile_active then
    perform public.raise_qarvon_error('QARVON_NO_ACCESS');
  end if;

  select * into v_target_stage
    from public.pipeline_stages
    where id = p_target_stage_id and organization_id = v_organization_id;
  if not found then
    perform public.raise_qarvon_error('QARVON_STAGE_NOT_FOUND');
  end if;
  if v_target_stage.stage_type <> 'LOST' then
    perform public.raise_qarvon_error('QARVON_INVALID_INPUT');
  end if;

  if p_lost_reason_id is not null then
    if not exists (
      select 1 from public.lost_reasons
      where id = p_lost_reason_id and organization_id = v_organization_id
    ) then
      perform public.raise_qarvon_error('QARVON_INVALID_INPUT');
    end if;
  end if;

  v_lead := public._move_lead_to_stage_core(
    v_organization_id, p_lead_id, p_target_stage_id, v_profile_id
  );

  update public.leads
    set lost_reason_id = p_lost_reason_id,
        lost_note = p_lost_note
    where id = p_lead_id
    returning * into v_lead;

  return v_lead;
end;
$$;

revoke execute on function public.close_lead_lost(uuid, uuid, uuid, text) from public;
revoke execute on function public.close_lead_lost(uuid, uuid, uuid, text) from anon;
revoke execute on function public.close_lead_lost(uuid, uuid, uuid, text) from service_role;
grant execute on function public.close_lead_lost(uuid, uuid, uuid, text) to authenticated;
