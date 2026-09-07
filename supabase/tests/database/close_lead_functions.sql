-- Testa close_lead_won e close_lead_lost (M2.2C): movimentação real via
-- _move_lead_to_stage_core (mesmo núcleo de move_lead_to_stage), validação
-- de stage_type do destino, criação/upsert de deals, criação idempotente de
-- conversion_events PENDING, e persistência de lost_reason_id/lost_note.
--
-- Executar com: supabase test db
-- (depende do Supabase CLI + Docker; não executável no ambiente deste
-- agente. Escrito e revisado estaticamente, NÃO executado.)

begin;
select plan(22);

-- ---------------------------------------------------------------------
-- Setup
-- ---------------------------------------------------------------------

create temporary table test_scratch (key text primary key, value text);

-- Achado real ao rodar contra Postgres de verdade (ver mesmo comentário em
-- pipeline_rpc.sql): tabela TEMPORARY fica fora do "schema public", os
-- GRANTs de bootstrap nunca a alcançam.
grant all on test_scratch to authenticated, anon, service_role;

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-000000000030', 'Org Close Lead');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a3', 'admin-close@example.com');

insert into public.profiles (id, organization_id, name, email, role, active) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000030', 'Admin Close', 'admin-close@example.com', 'ADMIN', true);

insert into public.pipelines (id, organization_id, name, is_default, active) values
  ('10000000-0000-4000-8000-000000000030', '00000000-0000-0000-0000-000000000030', 'Pipeline Close', true, true);

insert into public.pipeline_stages (id, organization_id, pipeline_id, name, position, probability, stage_type, active) values
  ('20000000-0000-4000-8000-000000000301', '00000000-0000-0000-0000-000000000030', '10000000-0000-4000-8000-000000000030', 'Novo Lead', 1, 5, 'OPEN', true),
  ('20000000-0000-4000-8000-000000000302', '00000000-0000-0000-0000-000000000030', '10000000-0000-4000-8000-000000000030', 'Fechado', 2, 100, 'WON', true),
  ('20000000-0000-4000-8000-000000000303', '00000000-0000-0000-0000-000000000030', '10000000-0000-4000-8000-000000000030', 'Perdido', 3, 0, 'LOST', true);

insert into public.lost_reasons (id, organization_id, name, active) values
  ('40000000-0000-4000-8000-000000000401', '00000000-0000-0000-0000-000000000030', 'Preço', true);

insert into public.leads (id, organization_id, name, pipeline_id, stage_id) values
  ('30000000-0000-4000-8000-000000000401', '00000000-0000-0000-0000-000000000030', 'Lead Won 1', '10000000-0000-4000-8000-000000000030', '20000000-0000-4000-8000-000000000301'),
  ('30000000-0000-4000-8000-000000000402', '00000000-0000-0000-0000-000000000030', 'Lead Lost 1', '10000000-0000-4000-8000-000000000030', '20000000-0000-4000-8000-000000000301');

-- ---------------------------------------------------------------------
-- Grants — 4 assertions
-- ---------------------------------------------------------------------

select ok(has_function_privilege('authenticated', 'public.close_lead_won(uuid, uuid, numeric, numeric, text)', 'EXECUTE'), 'authenticated tem EXECUTE em close_lead_won');
select ok(not has_function_privilege('anon', 'public.close_lead_won(uuid, uuid, numeric, numeric, text)', 'EXECUTE'), 'anon não tem EXECUTE em close_lead_won');
select ok(has_function_privilege('authenticated', 'public.close_lead_lost(uuid, uuid, uuid, text)', 'EXECUTE'), 'authenticated tem EXECUTE em close_lead_lost');
select ok(not has_function_privilege('service_role', 'public.close_lead_lost(uuid, uuid, uuid, text)', 'EXECUTE'), 'service_role não tem EXECUTE em close_lead_lost');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';

-- ---------------------------------------------------------------------
-- close_lead_won — 11 assertions
-- ---------------------------------------------------------------------

select throws_ok(
  $$ select * from public.close_lead_won('30000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000301', 2500, null, null) $$,
  'QV001',
  'QARVON_INVALID_INPUT',
  'close_lead_won: target_stage_id que não é WON é QARVON_INVALID_INPUT'
);
select throws_ok(
  $$ select * from public.close_lead_won('30000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000302', null, null, null) $$,
  'QV001',
  'QARVON_DEAL_VALUE_REQUIRED',
  'close_lead_won: nem MRR nem TCV informados é QARVON_DEAL_VALUE_REQUIRED'
);
select throws_ok(
  $$ select * from public.close_lead_won('30000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000302', -1, null, null) $$,
  'QV001',
  'QARVON_INVALID_INPUT',
  'close_lead_won: MRR negativo é QARVON_INVALID_INPUT'
);

do $$
declare
  v_result record;
begin
  select * into v_result from public.close_lead_won(
    '30000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000302', 2500, 15000, 'Fechado via teste'
  );
  insert into test_scratch (key, value) values ('deal_id', v_result.deal_id::text);
end;
$$;

select is(
  (select stage_id::text from public.leads where id = '30000000-0000-4000-8000-000000000401'),
  '20000000-0000-4000-8000-000000000302',
  'close_lead_won: lead movido para a stage WON'
);
select is(
  (select count(*)::int from public.lead_stage_history where lead_id = '30000000-0000-4000-8000-000000000401'),
  1,
  'close_lead_won: histórico de movimentação registrado (mesmo núcleo de move_lead_to_stage)'
);
select is(
  (select mrr from public.deals where id = (select value::uuid from test_scratch where key = 'deal_id')),
  2500::numeric,
  'close_lead_won: deal criado com o MRR informado'
);
select is(
  (select tcv from public.deals where id = (select value::uuid from test_scratch where key = 'deal_id')),
  15000::numeric,
  'close_lead_won: deal criado com o TCV informado'
);
select is(
  (select count(*)::int from public.deals where lead_id = '30000000-0000-4000-8000-000000000401'),
  1,
  'close_lead_won: exatamente 1 deal para este lead'
);
select is(
  (select count(*)::int from public.conversion_events where deal_id = (select value::uuid from test_scratch where key = 'deal_id') and event_name = 'Purchase'),
  1,
  'close_lead_won: conversion_events PENDING criado junto (mesma transação)'
);
select is(
  (select status::text from public.conversion_events where deal_id = (select value::uuid from test_scratch where key = 'deal_id')),
  'PENDING',
  'close_lead_won: conversion_events nasce PENDING (disparo real é responsabilidade do TypeScript, fora desta transação)'
);

-- Reenvio (correção de valores) no mesmo lead: no-op de movimentação (já
-- está em WON), mas UPSERT do deal — nunca duplica linha nem conversion_events.
do $$
begin
  perform public.close_lead_won(
    '30000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000302', 3000, 20000, 'Correção de valor'
  );
end;
$$;
select is(
  (select mrr from public.deals where id = (select value::uuid from test_scratch where key = 'deal_id')),
  3000::numeric,
  'close_lead_won: reenvio corrige o MRR do mesmo deal (upsert, não duplica)'
);
select is(
  (select count(*)::int from public.deals where lead_id = '30000000-0000-4000-8000-000000000401'),
  1,
  'close_lead_won: ainda exatamente 1 deal após a correção'
);
select is(
  (select count(*)::int from public.conversion_events where deal_id = (select value::uuid from test_scratch where key = 'deal_id')),
  1,
  'close_lead_won: ainda exatamente 1 conversion_events após a correção (nunca duplica Purchase)'
);

-- ---------------------------------------------------------------------
-- close_lead_lost — 5 assertions
-- ---------------------------------------------------------------------

select throws_ok(
  $$ select public.close_lead_lost('30000000-0000-4000-8000-000000000402', '20000000-0000-4000-8000-000000000301', null, null) $$,
  'QV001',
  'QARVON_INVALID_INPUT',
  'close_lead_lost: target_stage_id que não é LOST é QARVON_INVALID_INPUT'
);
select throws_ok(
  $$ select public.close_lead_lost('30000000-0000-4000-8000-000000000402', '20000000-0000-4000-8000-000000000303', '40000000-0000-4000-8000-000000000499', null) $$,
  'QV001',
  'QARVON_INVALID_INPUT',
  'close_lead_lost: lost_reason_id de outra organização/inexistente é QARVON_INVALID_INPUT'
);
select lives_ok(
  $$ select public.close_lead_lost('30000000-0000-4000-8000-000000000402', '20000000-0000-4000-8000-000000000303', null, 'Sem motivo específico') $$,
  'close_lead_lost: lost_reason_id nulo é aceito (motivo recomendado, não obrigatório)'
);
select is(
  (select stage_id::text from public.leads where id = '30000000-0000-4000-8000-000000000402'),
  '20000000-0000-4000-8000-000000000303',
  'close_lead_lost: lead movido para a stage LOST'
);
select is(
  (select lost_note from public.leads where id = '30000000-0000-4000-8000-000000000402'),
  'Sem motivo específico',
  'close_lead_lost: lost_note persistida'
);

reset role;

select * from finish();
rollback;
