-- Testa as duas RPCs transacionais do M2.2A (move_lead_to_stage,
-- create_lead_with_pipeline) e o helper raise_qarvon_error: fronteira de
-- segurança quando chamadas diretamente (bypass de createLead()), locking,
-- no-op, atomicidade, grants.
--
-- Executar com: supabase test db
-- (depende do Supabase CLI + Docker; não executável no ambiente deste
-- agente — mesma limitação já documentada em rls_isolation.sql e
-- pipeline_isolation.sql)

begin;
select plan(49);

-- ---------------------------------------------------------------------
-- Setup (como owner da tabela)
-- ---------------------------------------------------------------------

create temporary table test_scratch (key text primary key, value text);

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Org A'),
  ('00000000-0000-0000-0000-000000000002', 'Org B'),
  ('00000000-0000-0000-0000-000000000005', 'Org E (sem pipeline)'),
  ('00000000-0000-0000-0000-000000000006', 'Org F (sem stage OPEN)');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'user-a@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'user-b@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'user-c-sem-profile@example.com'),
  ('00000000-0000-0000-0000-0000000000d1', 'user-d-inativo@example.com'),
  ('00000000-0000-0000-0000-0000000000e1', 'user-e@example.com'),
  ('00000000-0000-0000-0000-0000000000f1', 'user-f@example.com');

insert into public.profiles (id, organization_id, name, email, role, active) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'User A', 'user-a@example.com', 'ADMIN', true),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000002', 'User B', 'user-b@example.com', 'ADMIN', true),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000001', 'User D (inativo)', 'user-d@example.com', 'SALES', false),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000005', 'User E', 'user-e@example.com', 'ADMIN', true),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000006', 'User F', 'user-f@example.com', 'ADMIN', true);
-- User C fica sem profile de propósito.

insert into public.pipelines (id, organization_id, name, is_default, active) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001', 'Pipeline A (default)', true, true),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000001', 'Pipeline A2 (secundário ativo)', false, true),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000001', 'Pipeline C (inativo)', false, false),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000002', 'Pipeline B (default)', true, true),
  ('10000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000006', 'Pipeline F (só WON)', true, true);

insert into public.pipeline_stages (id, organization_id, pipeline_id, name, position, probability, stage_type, active) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-4000-8000-000000000001', 'Novo Lead', 1, 5, 'OPEN', true),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-4000-8000-000000000001', 'Fechado', 2, 100, 'WON', true),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000001', '10000000-0000-4000-8000-000000000001', 'Perdido', 3, 0, 'LOST', true),
  ('20000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000001', '10000000-0000-4000-8000-000000000001', 'Inativa', 4, 15, 'OPEN', false),
  ('20000000-0000-4000-8000-000000000031', '00000000-0000-0000-0000-000000000001', '10000000-0000-4000-8000-000000000004', 'Entrada A2', 1, 5, 'OPEN', true),
  ('20000000-0000-4000-8000-000000000021', '00000000-0000-0000-0000-000000000001', '10000000-0000-4000-8000-000000000003', 'Entrada C (pipeline inativo)', 1, 5, 'OPEN', true),
  ('20000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000002', '10000000-0000-4000-8000-000000000002', 'Novo Lead B', 1, 5, 'OPEN', true),
  ('20000000-0000-4000-8000-000000000061', '00000000-0000-0000-0000-000000000006', '10000000-0000-4000-8000-000000000006', 'Só Fechado', 1, 100, 'WON', true);

insert into public.lead_sources (id, organization_id, name, active) values
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001', 'Source A ativa', true),
  ('50000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000001', 'Source A inativa', false),
  ('50000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000002', 'Source B ativa', true);

insert into public.leads (id, organization_id, name, whatsapp, pipeline_id, stage_id) values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001', 'Lead A1', '5511999999999', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000002', 'Lead B1', null, '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000011');

-- Lead com estado parcial (pipeline_id preenchido, stage_id nulo) — só
-- alcançável hoje via escrita direta como owner (bypassa RLS/FK MATCH
-- SIMPLE permite), nunca produzido pelas próprias RPCs. Usado só para
-- provar que move_lead_to_stage recusa esse estado em vez de tratá-lo
-- como bootstrap.
insert into public.leads (id, organization_id, name, pipeline_id, stage_id) values
  ('30000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000001', 'Lead A2 (estado parcial)', '10000000-0000-4000-8000-000000000001', null);

-- ---------------------------------------------------------------------
-- Grants (owner-level, independente de role)
-- ---------------------------------------------------------------------

select ok(
  has_function_privilege('authenticated', 'public.move_lead_to_stage(uuid, uuid)', 'EXECUTE'),
  'authenticated tem EXECUTE em move_lead_to_stage'
);
select ok(
  not has_function_privilege('anon', 'public.move_lead_to_stage(uuid, uuid)', 'EXECUTE'),
  'anon não tem EXECUTE em move_lead_to_stage'
);
select ok(
  not has_function_privilege('service_role', 'public.create_lead_with_pipeline(jsonb)', 'EXECUTE'),
  'service_role não tem EXECUTE em create_lead_with_pipeline (aplicação nunca usa service role)'
);
select ok(
  not has_function_privilege('authenticated', 'public.raise_qarvon_error(text)', 'EXECUTE'),
  'authenticated não tem EXECUTE em raise_qarvon_error (helper interno, não é endpoint)'
);

-- ---------------------------------------------------------------------
-- move_lead_to_stage: acesso (sem profile / profile inativo)
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

select throws_ok(
  $$ select public.move_lead_to_stage('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002') $$,
  'QV001',
  'usuário sem profile: QARVON_NO_ACCESS'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';

select throws_ok(
  $$ select public.move_lead_to_stage('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002') $$,
  'QV001',
  'profile inativo: QARVON_NO_ACCESS'
);

-- ---------------------------------------------------------------------
-- move_lead_to_stage: como User A
-- ---------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

select throws_ok(
  $$ select public.move_lead_to_stage('30000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000002') $$,
  'QV001',
  'lead de outro tenant: QARVON_LEAD_NOT_FOUND (cross-tenant indistinguível de inexistente)'
);

select throws_ok(
  $$ select public.move_lead_to_stage('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000011') $$,
  'QV001',
  'stage de outro tenant: QARVON_STAGE_NOT_FOUND'
);

-- Movimento real (Stage A1 -> Stage A2, mesma pipeline): verificado em
-- detalhe abaixo (snapshots, history, changed_by).
select lives_ok(
  $$ select public.move_lead_to_stage('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002') $$,
  'movimento válido dentro do próprio tenant é aceito'
);

select is(
  (select stage_id::text from public.leads where id = '30000000-0000-4000-8000-000000000001'),
  '20000000-0000-4000-8000-000000000002',
  'lead foi atualizado para a stage de destino'
);

select is(
  (select count(*)::int from public.lead_stage_history
     where lead_id = '30000000-0000-4000-8000-000000000001' and to_stage_id = '20000000-0000-4000-8000-000000000002'),
  1,
  'exatamente 1 evento de history foi criado para este movimento'
);

select is(
  (select from_pipeline_id::text from public.lead_stage_history
     where lead_id = '30000000-0000-4000-8000-000000000001' and to_stage_id = '20000000-0000-4000-8000-000000000002'),
  '10000000-0000-4000-8000-000000000001',
  'from_pipeline_id correto (snapshot da stage de origem)'
);
select is(
  (select from_stage_id::text from public.lead_stage_history
     where lead_id = '30000000-0000-4000-8000-000000000001' and to_stage_id = '20000000-0000-4000-8000-000000000002'),
  '20000000-0000-4000-8000-000000000001',
  'from_stage_id correto (snapshot da stage de origem)'
);
select is(
  (select from_position from public.lead_stage_history
     where lead_id = '30000000-0000-4000-8000-000000000001' and to_stage_id = '20000000-0000-4000-8000-000000000002'),
  1,
  'from_position correto (snapshot da position no momento da transição)'
);

select is(
  (select to_pipeline_id::text from public.lead_stage_history
     where lead_id = '30000000-0000-4000-8000-000000000001' and to_stage_id = '20000000-0000-4000-8000-000000000002'),
  '10000000-0000-4000-8000-000000000001',
  'to_pipeline_id correto (snapshot da stage de destino)'
);
select is(
  (select to_position from public.lead_stage_history
     where lead_id = '30000000-0000-4000-8000-000000000001' and to_stage_id = '20000000-0000-4000-8000-000000000002'),
  2,
  'to_position correto (snapshot da stage de destino)'
);

select is(
  (select changed_by::text from public.lead_stage_history
     where lead_id = '30000000-0000-4000-8000-000000000001' and to_stage_id = '20000000-0000-4000-8000-000000000002'),
  '00000000-0000-0000-0000-0000000000a1',
  'changed_by é o profile autenticado que executou o movimento'
);

-- No-op: mover para a própria stage atual não faz nada.
select lives_ok(
  $$ select public.move_lead_to_stage('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002') $$,
  'no-op (mesma stage) não lança erro'
);

select is(
  (select stage_id::text from public.leads where id = '30000000-0000-4000-8000-000000000001'),
  '20000000-0000-4000-8000-000000000002',
  'no-op não altera o lead'
);

select is(
  (select count(*)::int from public.lead_stage_history where lead_id = '30000000-0000-4000-8000-000000000001'),
  1,
  'no-op não cria nenhum evento de history novo'
);

-- Cross-pipeline dentro do mesmo tenant: permitido.
select lives_ok(
  $$ select public.move_lead_to_stage('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000031') $$,
  'movimento entre pipelines diferentes da mesma organização é permitido'
);
select is(
  (select pipeline_id::text from public.leads where id = '30000000-0000-4000-8000-000000000001'),
  '10000000-0000-4000-8000-000000000004',
  'lead passou a pertencer ao novo pipeline'
);

-- Stage inativa bloqueia movimento real.
select throws_ok(
  $$ select public.move_lead_to_stage('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004') $$,
  'QV001',
  'stage inativa: QARVON_STAGE_INACTIVE'
);

-- Pipeline inativa bloqueia movimento real (stage em si está ativa).
select throws_ok(
  $$ select public.move_lead_to_stage('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000021') $$,
  'QV001',
  'pipeline de destino inativa: QARVON_PIPELINE_INACTIVE'
);

-- Estado parcial nunca é tratado como bootstrap silenciosamente.
select throws_ok(
  $$ select public.move_lead_to_stage('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001') $$,
  'QV001',
  'lead com pipeline_id/stage_id parcialmente nulo: QARVON_INVARIANT_VIOLATION, não bootstrap'
);

-- ---------------------------------------------------------------------
-- Atomicidade: uma tentativa inválida não deixa estado parcial. Como o
-- corpo inteiro da função é uma única transação implícita (garantia da
-- própria linguagem PL/pgSQL — um RAISE EXCEPTION em qualquer ponto desfaz
-- tudo que a função já tinha feito), provar isso uma vez no caminho mais
-- claro (stage inexistente) é suficiente: o mesmo mecanismo vale para
-- qualquer outro ponto de falha, não é algo que precise ser re-testado por
-- caminho de erro.
-- ---------------------------------------------------------------------

select is(
  (select count(*)::int from public.lead_stage_history where lead_id = '30000000-0000-4000-8000-000000000001'),
  2,
  'contagem de history antes da tentativa inválida (baseline: movimento real + cross-pipeline)'
);

select throws_ok(
  $$ select public.move_lead_to_stage('30000000-0000-4000-8000-000000000001', '99999999-9999-4999-8999-999999999999') $$,
  'QV001',
  'stage inexistente: QARVON_STAGE_NOT_FOUND'
);

select is(
  (select pipeline_id::text from public.leads where id = '30000000-0000-4000-8000-000000000001'),
  '10000000-0000-4000-8000-000000000004',
  'após tentativa inválida, o lead permanece exatamente no estado anterior'
);

select is(
  (select count(*)::int from public.lead_stage_history where lead_id = '30000000-0000-4000-8000-000000000001'),
  2,
  'após tentativa inválida, nenhum evento de history novo foi criado (sem estado parcial)'
);

-- ---------------------------------------------------------------------
-- create_lead_with_pipeline: como User A
-- ---------------------------------------------------------------------

select lives_ok(
  $$ select public.create_lead_with_pipeline('{"name": "Lead novo via RPC"}'::jsonb) $$,
  'criação válida (payload mínimo) é aceita'
);

do $$
declare
  v_id uuid;
begin
  select id into v_id from public.leads
    where organization_id = '00000000-0000-0000-0000-000000000001' and name = 'Lead novo via RPC';
  insert into test_scratch (key, value) values ('new_lead_id', v_id::text)
    on conflict (key) do update set value = excluded.value;
end;
$$;

select is(
  (select pipeline_id::text from public.leads where id = (select value::uuid from test_scratch where key = 'new_lead_id')),
  '10000000-0000-4000-8000-000000000001',
  'lead novo nasce no pipeline default da organização'
);
select is(
  (select stage_id::text from public.leads where id = (select value::uuid from test_scratch where key = 'new_lead_id')),
  '20000000-0000-4000-8000-000000000001',
  'lead novo nasce na primeira stage OPEN ativa (menor position)'
);
select is(
  (select count(*)::int from public.lead_stage_history
     where lead_id = (select value::uuid from test_scratch where key = 'new_lead_id')
       and from_pipeline_id is null and from_stage_id is null and from_position is null),
  1,
  'bootstrap de criação tem from_* inteiramente nulo'
);

select throws_ok(
  $$ select public.create_lead_with_pipeline('{"name": "x", "foo": "bar"}'::jsonb) $$,
  'QV001',
  'chave desconhecida no payload: QARVON_INVALID_INPUT'
);
select throws_ok(
  $$ select public.create_lead_with_pipeline('{"name": "x", "organization_id": "00000000-0000-0000-0000-000000000002"}'::jsonb) $$,
  'QV001',
  'organization_id no payload: QARVON_INVALID_INPUT'
);
select throws_ok(
  $$ select public.create_lead_with_pipeline('{"name": "x", "pipeline_id": "10000000-0000-4000-8000-000000000002"}'::jsonb) $$,
  'QV001',
  'pipeline_id no payload: QARVON_INVALID_INPUT'
);

select throws_ok(
  $$ select public.create_lead_with_pipeline('{"name": "x", "owner_id": "00000000-0000-0000-0000-0000000000b1"}'::jsonb) $$,
  'QV001',
  'owner de outro tenant: QARVON_INVALID_OWNER'
);
select throws_ok(
  $$ select public.create_lead_with_pipeline('{"name": "x", "lead_source_id": "50000000-0000-4000-8000-000000000011"}'::jsonb) $$,
  'QV001',
  'source de outro tenant: QARVON_INVALID_LEAD_SOURCE'
);
select throws_ok(
  $$ select public.create_lead_with_pipeline('{"name": "x", "lead_source_id": "50000000-0000-4000-8000-000000000002"}'::jsonb) $$,
  'QV001',
  'source inativa: QARVON_INVALID_LEAD_SOURCE'
);
select throws_ok(
  $$ select public.create_lead_with_pipeline('{"name": "x", "whatsapp": "5511999999999"}'::jsonb) $$,
  'QV001',
  'WhatsApp já usado por outro lead do mesmo tenant: QARVON_DUPLICATE_WHATSAPP'
);

reset role;

-- Sem pipeline default: nenhum lead é criado.
select is(
  (select count(*)::int from public.leads where organization_id = '00000000-0000-0000-0000-000000000005'),
  0,
  'Org E não tem nenhum lead antes da tentativa'
);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select throws_ok(
  $$ select public.create_lead_with_pipeline('{"name": "x"}'::jsonb) $$,
  'QV001',
  'organização sem pipeline default: QARVON_NO_DEFAULT_PIPELINE'
);
reset role;
select is(
  (select count(*)::int from public.leads where organization_id = '00000000-0000-0000-0000-000000000005'),
  0,
  'nenhum lead foi criado para Org E'
);

-- Pipeline default sem nenhuma stage OPEN ativa: mesmo marcador, nenhum lead criado.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select throws_ok(
  $$ select public.create_lead_with_pipeline('{"name": "x"}'::jsonb) $$,
  'QV001',
  'pipeline default sem stage OPEN ativa: QARVON_NO_DEFAULT_PIPELINE'
);
reset role;
select is(
  (select count(*)::int from public.leads where organization_id = '00000000-0000-0000-0000-000000000006'),
  0,
  'nenhum lead foi criado para Org F'
);

-- ---------------------------------------------------------------------
-- lead_stage_history: regressão do append-only (M2.1), reafirmada aqui no
-- contexto das novas RPCs.
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

select throws_ok(
  $$ insert into public.lead_stage_history (organization_id, lead_id, to_pipeline_id, to_stage_id, to_position)
     values ('00000000-0000-0000-0000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1) $$,
  '42501',
  'INSERT direto em lead_stage_history continua bloqueado para authenticated'
);

-- changed_by de todo o histórico deste lead já é User A (as duas RPCs
-- sempre preenchem changed_by); tentamos corromper to_position para um
-- valor absurdo e confirmamos que nenhuma linha muda.
update public.lead_stage_history set to_position = -1
  where lead_id = '30000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.lead_stage_history
     where lead_id = '30000000-0000-4000-8000-000000000001' and to_position = -1),
  0,
  'UPDATE direto em lead_stage_history continua bloqueado para authenticated — nenhuma linha alterada'
);

delete from public.lead_stage_history where lead_id = '30000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.lead_stage_history where lead_id = '30000000-0000-4000-8000-000000000001'),
  2,
  'DELETE direto em lead_stage_history continua bloqueado para authenticated — linhas permanecem'
);

select throws_ok(
  $$ select public.raise_qarvon_error('QARVON_TEST') $$,
  '42501',
  'authenticated não consegue chamar raise_qarvon_error diretamente (helper interno, não é endpoint)'
);

reset role;
