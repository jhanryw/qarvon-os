-- Testa as 4 RPCs de gestão de stages (M2.2C):
-- create_pipeline_stage, update_pipeline_stage, reorder_pipeline_stages,
-- delete_pipeline_stage. Cobre especialmente as travas estruturais (Lead
-- Novo/WON/LOST nunca desativáveis nem excluíveis) e a migração segura de
-- leads ao excluir uma stage intermediária com leads.
--
-- Executar com: supabase test db
-- (depende do Supabase CLI + Docker; não executável no ambiente deste
-- agente. Escrito e revisado estaticamente, NÃO executado.)

begin;
select plan(36);

-- ---------------------------------------------------------------------
-- Setup
-- ---------------------------------------------------------------------

create temporary table test_scratch (key text primary key, value text);

-- Achado real ao rodar contra Postgres de verdade (ver mesmo comentário em
-- pipeline_rpc.sql): tabela TEMPORARY fica fora do "schema public", os
-- GRANTs de bootstrap nunca a alcançam.
grant all on test_scratch to authenticated, anon, service_role;

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-000000000020', 'Org Stage Mgmt');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a2', 'admin-stage@example.com');

insert into public.profiles (id, organization_id, name, email, role, active) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000020', 'Admin Stage', 'admin-stage@example.com', 'ADMIN', true);

insert into public.pipelines (id, organization_id, name, is_default, active) values
  ('10000000-0000-4000-8000-000000000020', '00000000-0000-0000-0000-000000000020', 'Pipeline Stage Mgmt', true, true);

-- Lead Novo (pos 1) -> Qualificado (pos 2) -> WON (pos 3) -> LOST (pos 4)
insert into public.pipeline_stages (id, organization_id, pipeline_id, name, position, probability, stage_type, active) values
  ('20000000-0000-4000-8000-000000000201', '00000000-0000-0000-0000-000000000020', '10000000-0000-4000-8000-000000000020', 'Lead Novo', 1, 5, 'OPEN', true),
  ('20000000-0000-4000-8000-000000000202', '00000000-0000-0000-0000-000000000020', '10000000-0000-4000-8000-000000000020', 'Qualificado', 2, 25, 'OPEN', true),
  ('20000000-0000-4000-8000-000000000203', '00000000-0000-0000-0000-000000000020', '10000000-0000-4000-8000-000000000020', 'Fechado', 3, 100, 'WON', true),
  ('20000000-0000-4000-8000-000000000204', '00000000-0000-0000-0000-000000000020', '10000000-0000-4000-8000-000000000020', 'Perdido', 4, 0, 'LOST', true);

insert into public.leads (id, organization_id, name, pipeline_id, stage_id) values
  ('30000000-0000-4000-8000-000000000301', '00000000-0000-0000-0000-000000000020', 'Lead Qualificado 1', '10000000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-000000000202'),
  ('30000000-0000-4000-8000-000000000302', '00000000-0000-0000-0000-000000000020', 'Lead Qualificado 2', '10000000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-000000000202');

-- ---------------------------------------------------------------------
-- Grants — 8 assertions
-- ---------------------------------------------------------------------

select ok(has_function_privilege('authenticated', 'public.create_pipeline_stage(uuid, text)', 'EXECUTE'), 'authenticated tem EXECUTE em create_pipeline_stage');
select ok(not has_function_privilege('anon', 'public.create_pipeline_stage(uuid, text)', 'EXECUTE'), 'anon não tem EXECUTE em create_pipeline_stage');
select ok(has_function_privilege('authenticated', 'public.update_pipeline_stage(uuid, text, boolean)', 'EXECUTE'), 'authenticated tem EXECUTE em update_pipeline_stage');
select ok(not has_function_privilege('anon', 'public.update_pipeline_stage(uuid, text, boolean)', 'EXECUTE'), 'anon não tem EXECUTE em update_pipeline_stage');
select ok(has_function_privilege('authenticated', 'public.reorder_pipeline_stages(uuid, uuid[])', 'EXECUTE'), 'authenticated tem EXECUTE em reorder_pipeline_stages');
select ok(not has_function_privilege('service_role', 'public.reorder_pipeline_stages(uuid, uuid[])', 'EXECUTE'), 'service_role não tem EXECUTE em reorder_pipeline_stages');
select ok(has_function_privilege('authenticated', 'public.delete_pipeline_stage(uuid, uuid)', 'EXECUTE'), 'authenticated tem EXECUTE em delete_pipeline_stage');
select ok(not has_function_privilege('anon', 'public.delete_pipeline_stage(uuid, uuid)', 'EXECUTE'), 'anon não tem EXECUTE em delete_pipeline_stage');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';

-- ---------------------------------------------------------------------
-- create_pipeline_stage — 6 assertions
-- ---------------------------------------------------------------------

do $$
declare
  v_stage public.pipeline_stages;
begin
  v_stage := public.create_pipeline_stage('10000000-0000-4000-8000-000000000020', 'Proposta Enviada');
  insert into test_scratch (key, value) values ('new_stage_id', v_stage.id::text);
end;
$$;

select is(
  (select stage_type::text from public.pipeline_stages where id = (select value::uuid from test_scratch where key = 'new_stage_id')),
  'OPEN',
  'create_pipeline_stage: nova stage nasce OPEN'
);
select is(
  (select position from public.pipeline_stages where id = (select value::uuid from test_scratch where key = 'new_stage_id')),
  3,
  'create_pipeline_stage: nasce na posição da antiga WON (3), empurrando WON/LOST'
);
select is(
  (select position from public.pipeline_stages where id = '20000000-0000-4000-8000-000000000203'),
  4,
  'create_pipeline_stage: WON foi deslocada para position 4'
);
select is(
  (select position from public.pipeline_stages where id = '20000000-0000-4000-8000-000000000204'),
  5,
  'create_pipeline_stage: LOST foi deslocada para position 5'
);
select is(
  (select count(*)::int from public.pipeline_stages where pipeline_id = '10000000-0000-4000-8000-000000000020'),
  5,
  'create_pipeline_stage: total de stages agora é 5'
);
select throws_ok(
  $$ select public.create_pipeline_stage('10000000-0000-4000-8000-000000000020', '   ') $$,
  'QV001',
  'QARVON_INVALID_INPUT',
  'create_pipeline_stage: nome em branco é QARVON_INVALID_INPUT'
);

-- ---------------------------------------------------------------------
-- update_pipeline_stage — 6 assertions
-- ---------------------------------------------------------------------

select lives_ok(
  $$ select public.update_pipeline_stage('20000000-0000-4000-8000-000000000202', 'Qualificado (renomeado)', null) $$,
  'update_pipeline_stage: renomear uma stage intermediária é permitido'
);
select is(
  (select name from public.pipeline_stages where id = '20000000-0000-4000-8000-000000000202'),
  'Qualificado (renomeado)',
  'update_pipeline_stage: nome persistido'
);
select lives_ok(
  $$ select public.update_pipeline_stage('20000000-0000-4000-8000-000000000202', null, false) $$,
  'update_pipeline_stage: desativar uma stage intermediária é permitido'
);
select throws_ok(
  $$ select public.update_pipeline_stage('20000000-0000-4000-8000-000000000201', null, false) $$,
  'QV001',
  'QARVON_STAGE_PROTECTED',
  'update_pipeline_stage: desativar Lead Novo (primeira OPEN) é QARVON_STAGE_PROTECTED'
);
select throws_ok(
  $$ select public.update_pipeline_stage('20000000-0000-4000-8000-000000000203', null, false) $$,
  'QV001',
  'QARVON_STAGE_PROTECTED',
  'update_pipeline_stage: desativar a stage WON é QARVON_STAGE_PROTECTED'
);
select throws_ok(
  $$ select public.update_pipeline_stage('20000000-0000-4000-8000-000000000204', null, false) $$,
  'QV001',
  'QARVON_STAGE_PROTECTED',
  'update_pipeline_stage: desativar a stage LOST é QARVON_STAGE_PROTECTED'
);

-- Reativa para os testes seguintes não dependerem desta desativação.
select lives_ok(
  $$ select public.update_pipeline_stage('20000000-0000-4000-8000-000000000202', null, true) $$,
  'update_pipeline_stage: reativar a mesma stage'
);

-- ---------------------------------------------------------------------
-- reorder_pipeline_stages — 4 assertions
-- ---------------------------------------------------------------------

select lives_ok(
  $$ select public.reorder_pipeline_stages(
       '10000000-0000-4000-8000-000000000020',
       array[(select value::uuid from test_scratch where key = 'new_stage_id'), '20000000-0000-4000-8000-000000000202']::uuid[]
     ) $$,
  'reorder_pipeline_stages: aceita o conjunto correto de stages OPEN intermediárias'
);
select is(
  (select position < (select position from public.pipeline_stages where id = '20000000-0000-4000-8000-000000000202')
     from public.pipeline_stages where id = (select value::uuid from test_scratch where key = 'new_stage_id')),
  true,
  'reorder_pipeline_stages: nova ordem realmente aplicada (Proposta antes de Qualificado)'
);
select throws_ok(
  $$ select public.reorder_pipeline_stages('10000000-0000-4000-8000-000000000020', array['20000000-0000-4000-8000-000000000201']::uuid[]) $$,
  'QV001',
  'QARVON_INVALID_INPUT',
  'reorder_pipeline_stages: incluir Lead Novo no conjunto é QARVON_INVALID_INPUT'
);
select throws_ok(
  $$ select public.reorder_pipeline_stages('10000000-0000-4000-8000-000000000020', array['20000000-0000-4000-8000-000000000203']::uuid[]) $$,
  'QV001',
  'QARVON_INVALID_INPUT',
  'reorder_pipeline_stages: incluir a stage WON no conjunto é QARVON_INVALID_INPUT'
);

-- ---------------------------------------------------------------------
-- delete_pipeline_stage — 9 assertions
-- ---------------------------------------------------------------------

select throws_ok(
  $$ select public.delete_pipeline_stage('20000000-0000-4000-8000-000000000201', null) $$,
  'QV001',
  'QARVON_STAGE_PROTECTED',
  'delete_pipeline_stage: excluir Lead Novo é QARVON_STAGE_PROTECTED'
);
select throws_ok(
  $$ select public.delete_pipeline_stage('20000000-0000-4000-8000-000000000203', null) $$,
  'QV001',
  'QARVON_STAGE_PROTECTED',
  'delete_pipeline_stage: excluir a stage WON é QARVON_STAGE_PROTECTED'
);
select throws_ok(
  $$ select public.delete_pipeline_stage('20000000-0000-4000-8000-000000000204', null) $$,
  'QV001',
  'QARVON_STAGE_PROTECTED',
  'delete_pipeline_stage: excluir a stage LOST é QARVON_STAGE_PROTECTED'
);
select throws_ok(
  $$ select public.delete_pipeline_stage('20000000-0000-4000-8000-000000000202', null) $$,
  'QV001',
  'QARVON_REASSIGN_STAGE_REQUIRED',
  'delete_pipeline_stage: stage com leads sem reassign_to é QARVON_REASSIGN_STAGE_REQUIRED'
);
select throws_ok(
  $$ select public.delete_pipeline_stage('20000000-0000-4000-8000-000000000202', '20000000-0000-4000-8000-000000000202') $$,
  'QV001',
  'QARVON_INVALID_INPUT',
  'delete_pipeline_stage: reassign_to igual à própria stage é QARVON_INVALID_INPUT'
);
select lives_ok(
  $$ select public.delete_pipeline_stage('20000000-0000-4000-8000-000000000202', (select value::uuid from test_scratch where key = 'new_stage_id')) $$,
  'delete_pipeline_stage: com reassign_to válido, migra os leads e remove a stage'
);
select is(
  (select count(*)::int from public.leads where stage_id = '20000000-0000-4000-8000-000000000202'),
  0,
  'delete_pipeline_stage: nenhum lead ficou na stage excluída'
);
select is(
  (select count(*)::int from public.leads where stage_id = (select value::uuid from test_scratch where key = 'new_stage_id')),
  2,
  'delete_pipeline_stage: os 2 leads foram migrados para a stage de destino'
);
select is(
  (select count(*)::int from public.lead_stage_history
     where lead_id in ('30000000-0000-4000-8000-000000000301', '30000000-0000-4000-8000-000000000302')
       and to_stage_id = (select value::uuid from test_scratch where key = 'new_stage_id')),
  2,
  'delete_pipeline_stage: histórico registrou a migração para cada lead (auditabilidade preservada)'
);

-- Stage sem histórico (nunca teve lead, criada e excluída na mesma
-- transação de teste): exclusão física de verdade, não soft-delete.
do $$
declare
  v_stage public.pipeline_stages;
begin
  v_stage := public.create_pipeline_stage('10000000-0000-4000-8000-000000000020', 'Stage Efêmera');
  insert into test_scratch (key, value) values ('ephemeral_stage_id', v_stage.id::text);
end;
$$;
select lives_ok(
  $$ select public.delete_pipeline_stage((select value::uuid from test_scratch where key = 'ephemeral_stage_id'), null) $$,
  'delete_pipeline_stage: stage sem leads nem histórico é excluída sem exigir reassign_to'
);
select is(
  (select count(*)::int from public.pipeline_stages where id = (select value::uuid from test_scratch where key = 'ephemeral_stage_id')),
  0,
  'delete_pipeline_stage: linha realmente removida (hard delete) quando nunca houve histórico'
);

reset role;

select * from finish();
rollback;
