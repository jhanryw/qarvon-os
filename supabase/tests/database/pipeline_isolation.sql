-- Testa isolamento multi-tenant e integridade estrutural do M2.1
-- (pipelines, pipeline_stages, leads.pipeline_id/stage_id,
-- lead_stage_history), incluindo o fato de que lead_stage_history não
-- aceita INSERT direto de "authenticated" (só a futura RPC transacional do
-- M2.2, via role de tabela, poderá escrever).
--
-- Executar com: supabase test db
-- (depende do Supabase CLI + Docker; não executável no ambiente deste
-- agente — mesma limitação já documentada em rls_isolation.sql)

begin;
select plan(37);

-- ---------------------------------------------------------------------
-- Setup (como owner da tabela — contorna RLS por padrão)
-- ---------------------------------------------------------------------

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Org A'),
  ('00000000-0000-0000-0000-000000000002', 'Org B');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'user-a@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'user-b@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'user-c-sem-profile@example.com');

insert into public.profiles (id, organization_id, name, email, role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'User A', 'user-a@example.com', 'ADMIN'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000002', 'User B', 'user-b@example.com', 'ADMIN');
-- User C fica sem profile de propósito (testa "authenticated sem profile").

insert into public.pipelines (id, organization_id, name, is_default, active) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001', 'Pipeline Comercial', true, true),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000002', 'Pipeline Comercial', true, true);

insert into public.pipeline_stages (id, organization_id, pipeline_id, name, position, probability, stage_type) values
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-4000-8000-000000000001', 'Novo Lead', 1, 5, 'OPEN'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-4000-8000-000000000001', 'Fechado', 2, 100, 'WON'),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000001', '10000000-0000-4000-8000-000000000001', 'Perdido', 3, 0, 'LOST'),
  ('20000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000002', '10000000-0000-4000-8000-000000000002', 'Novo Lead', 1, 5, 'OPEN'),
  ('20000000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000002', '10000000-0000-4000-8000-000000000002', 'Fechado', 2, 100, 'WON');

insert into public.leads (id, organization_id, name, pipeline_id, stage_id) values
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001', 'Lead A1', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');

insert into public.lead_stage_history (
  organization_id, lead_id,
  from_pipeline_id, from_stage_id, from_position,
  to_pipeline_id, to_stage_id, to_position,
  changed_by
) values (
  '00000000-0000-0000-0000-000000000001', '30000000-0000-4000-8000-000000000001',
  null, null, null,
  '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1,
  null
);

-- ---------------------------------------------------------------------
-- Tenant/RLS: visibilidade
-- ---------------------------------------------------------------------

set local role anon;

select is(
  (select count(*)::int from public.pipelines), 0,
  'anon não lê pipelines'
);
select is(
  (select count(*)::int from public.pipeline_stages), 0,
  'anon não lê pipeline_stages'
);
select is(
  (select count(*)::int from public.lead_stage_history), 0,
  'anon não lê lead_stage_history'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

select is(
  (select count(*)::int from public.pipelines), 0,
  'authenticated sem profile não lê pipelines'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

select is(
  (select count(*)::int from public.pipelines), 1,
  'User A só enxerga pipelines da própria organização'
);
select is(
  (select count(*)::int from public.pipeline_stages), 3,
  'User A só enxerga pipeline_stages da própria organização'
);
select is(
  (select count(*)::int from public.lead_stage_history), 1,
  'User A só enxerga lead_stage_history da própria organização'
);
select is(
  (select organization_id::text from public.lead_stage_history limit 1),
  '00000000-0000-0000-0000-000000000001',
  'lead_stage_history visível pertence à Org A'
);
select is(
  (select count(*)::int from public.lead_stage_history
     where organization_id = '00000000-0000-0000-0000-000000000002'),
  0,
  'lead_stage_history de Org B não vaza para User A'
);

-- ---------------------------------------------------------------------
-- Cross-tenant INSERT/UPDATE bloqueado (ainda como User A)
-- ---------------------------------------------------------------------

select throws_ok(
  $$ insert into public.pipelines (organization_id, name) values ('00000000-0000-0000-0000-000000000002', 'Pipeline Forjado') $$,
  '42501',
  'User A não consegue inserir pipeline com organization_id de outra organização'
);

select throws_ok(
  $$ update public.pipelines set organization_id = '00000000-0000-0000-0000-000000000002' where id = '10000000-0000-4000-8000-000000000001' $$,
  '42501',
  'User A não consegue mover o próprio pipeline para outra organização'
);

-- ---------------------------------------------------------------------
-- DELETE bloqueado (sem policy de DELETE = 0 linhas afetadas, sem exceção)
-- ---------------------------------------------------------------------

delete from public.pipelines where id = '10000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.pipelines where id = '10000000-0000-4000-8000-000000000001'),
  1,
  'DELETE em pipelines não é permitido para authenticated — linha permanece'
);

delete from public.pipeline_stages where id = '20000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.pipeline_stages where id = '20000000-0000-4000-8000-000000000001'),
  1,
  'DELETE em pipeline_stages não é permitido para authenticated — linha permanece'
);

-- ---------------------------------------------------------------------
-- Pipeline: múltiplos não-default permitidos, default único ativo
-- ---------------------------------------------------------------------

select lives_ok(
  $$ insert into public.pipelines (organization_id, name, is_default) values ('00000000-0000-0000-0000-000000000001', 'Pipeline Secundário', false) $$,
  'múltiplos pipelines não-default são permitidos na mesma organização'
);

select throws_ok(
  $$ insert into public.pipelines (organization_id, name, is_default) values ('00000000-0000-0000-0000-000000000001', 'Segundo Default', true) $$,
  '23505',
  'no máximo um pipeline default ativo por organização (índice único parcial)'
);

reset role;

-- ---------------------------------------------------------------------
-- pipeline_stages: constraints de dado (independentes de RLS — como owner)
-- ---------------------------------------------------------------------

select throws_ok(
  $$ insert into public.pipeline_stages (organization_id, pipeline_id, name, position, probability, stage_type)
     values ('00000000-0000-0000-0000-000000000001', '10000000-0000-4000-8000-000000000001', 'Inválida', 0, 5, 'OPEN') $$,
  '23514',
  'position deve ser positiva'
);

select throws_ok(
  $$ insert into public.pipeline_stages (organization_id, pipeline_id, name, position, probability, stage_type)
     values ('00000000-0000-0000-0000-000000000001', '10000000-0000-4000-8000-000000000001', 'Inválida', 4, 150, 'OPEN') $$,
  '23514',
  'probability deve estar entre 0 e 100'
);

select throws_ok(
  $$ insert into public.pipeline_stages (organization_id, pipeline_id, name, position, probability, stage_type)
     values ('00000000-0000-0000-0000-000000000001', '10000000-0000-4000-8000-000000000001', 'Fechado Errado', 4, 50, 'WON') $$,
  '23514',
  'stage WON exige probability = 100'
);

select throws_ok(
  $$ insert into public.pipeline_stages (organization_id, pipeline_id, name, position, probability, stage_type)
     values ('00000000-0000-0000-0000-000000000001', '10000000-0000-4000-8000-000000000001', 'Perdido Errado', 4, 50, 'LOST') $$,
  '23514',
  'stage LOST exige probability = 0'
);

select throws_ok(
  $$ insert into public.pipeline_stages (organization_id, pipeline_id, name, position, probability, stage_type)
     values ('00000000-0000-0000-0000-000000000001', '10000000-0000-4000-8000-000000000001', 'Segundo Fechado', 4, 100, 'WON') $$,
  '23505',
  'no máximo uma stage WON ativa por pipeline'
);

select throws_ok(
  $$ insert into public.pipeline_stages (organization_id, pipeline_id, name, position, probability, stage_type)
     values ('00000000-0000-0000-0000-000000000001', '10000000-0000-4000-8000-000000000001', 'Segundo Perdido', 4, 0, 'LOST') $$,
  '23505',
  'no máximo uma stage LOST ativa por pipeline'
);

select throws_ok(
  $$ update public.pipeline_stages set pipeline_id = '10000000-0000-4000-8000-000000000002' where id = '20000000-0000-4000-8000-000000000001' $$,
  'P0001',
  'pipeline_id não pode ser alterado após a criação'
);

select throws_ok(
  $$ update public.pipeline_stages set stage_type = 'WON' where id = '20000000-0000-4000-8000-000000000001' $$,
  'P0001',
  'stage_type não pode ser alterado após a criação'
);

select lives_ok(
  $$ update public.pipeline_stages set position = 99 where id = '20000000-0000-4000-8000-000000000003' $$,
  'position pode ser alterada'
);
update public.pipeline_stages set position = 3 where id = '20000000-0000-4000-8000-000000000003';

set constraints public.pipeline_stages_pipeline_position_key immediate;
select throws_ok(
  $$ insert into public.pipeline_stages (organization_id, pipeline_id, name, position, probability, stage_type)
     values ('00000000-0000-0000-0000-000000000001', '10000000-0000-4000-8000-000000000001', 'Posição Duplicada', 1, 5, 'OPEN') $$,
  '23505',
  'position é única por pipeline (constraint deferrable checada imediatamente)'
);

-- ---------------------------------------------------------------------
-- leads: integridade pipeline x stage x tenant
-- ---------------------------------------------------------------------

select throws_ok(
  $$ update public.leads set stage_id = '20000000-0000-4000-8000-000000000011' where id = '30000000-0000-4000-8000-000000000001' $$,
  '23503',
  'stage de outro pipeline não pode ser associada a um lead (pipeline_id/stage_id inconsistentes)'
);

select throws_ok(
  $$ update public.leads set pipeline_id = '10000000-0000-4000-8000-000000000002', stage_id = '20000000-0000-4000-8000-000000000011' where id = '30000000-0000-4000-8000-000000000001' $$,
  '23503',
  'pipeline de outra organização não pode ser associado a um lead'
);

select lives_ok(
  $$ insert into public.leads (organization_id, name) values ('00000000-0000-0000-0000-000000000001', 'Lead sem pipeline ainda') $$,
  'leads.pipeline_id/stage_id continuam nullable no schema neste milestone'
);

-- ---------------------------------------------------------------------
-- lead_stage_history: checks de consistência from_*/to_*
-- ---------------------------------------------------------------------

select lives_ok(
  $$ insert into public.lead_stage_history (organization_id, lead_id, from_pipeline_id, from_stage_id, from_position, to_pipeline_id, to_stage_id, to_position, changed_by)
     values ('00000000-0000-0000-0000-000000000001', '30000000-0000-4000-8000-000000000001', null, null, null, '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, null) $$,
  'evento com from_* inteiramente nulo (bootstrap) é aceito'
);

select lives_ok(
  $$ insert into public.lead_stage_history (organization_id, lead_id, from_pipeline_id, from_stage_id, from_position, to_pipeline_id, to_stage_id, to_position, changed_by)
     values ('00000000-0000-0000-0000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1, '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 2, '00000000-0000-0000-0000-0000000000a1') $$,
  'evento com from_* inteiramente preenchido (transição real) é aceito'
);

select throws_ok(
  $$ insert into public.lead_stage_history (organization_id, lead_id, from_pipeline_id, from_stage_id, from_position, to_pipeline_id, to_stage_id, to_position)
     values ('00000000-0000-0000-0000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', null, null, '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1) $$,
  '23514',
  'combinação parcial de from_* é rejeitada'
);

select throws_ok(
  $$ insert into public.lead_stage_history (organization_id, lead_id, from_pipeline_id, from_stage_id, from_position, to_pipeline_id, to_stage_id, to_position)
     values ('00000000-0000-0000-0000-000000000001', '30000000-0000-4000-8000-000000000001', null, null, null, '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 0) $$,
  '23514',
  'to_position deve ser positiva'
);

select throws_ok(
  $$ insert into public.lead_stage_history (organization_id, lead_id, from_pipeline_id, from_stage_id, from_position, to_pipeline_id, to_stage_id, to_position)
     values ('00000000-0000-0000-0000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 0, '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 2) $$,
  '23514',
  'from_position deve ser positiva quando preenchida'
);

select throws_ok(
  $$ insert into public.lead_stage_history (organization_id, lead_id, from_pipeline_id, from_stage_id, from_position, to_pipeline_id, to_stage_id, to_position)
     values ('00000000-0000-0000-0000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000011', 1, '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1) $$,
  '23503',
  'from_stage_id precisa pertencer ao from_pipeline_id informado'
);

-- ---------------------------------------------------------------------
-- lead_stage_history: append-only real (INSERT/UPDATE/DELETE bloqueados
-- para authenticated — só a futura RPC transacional poderá escrever)
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

select throws_ok(
  $$ insert into public.lead_stage_history (organization_id, lead_id, from_pipeline_id, from_stage_id, from_position, to_pipeline_id, to_stage_id, to_position)
     values ('00000000-0000-0000-0000-000000000001', '30000000-0000-4000-8000-000000000001', null, null, null, '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1) $$,
  '42501',
  'authenticated não consegue INSERT direto em lead_stage_history (sem policy de INSERT)'
);

-- Duas das três linhas já existentes para este lead têm changed_by nulo
-- neste ponto (o bootstrap do setup e o evento "from_* nulo" inserido
-- acima); a tentativa de UPDATE abaixo mira exatamente essas duas.
update public.lead_stage_history
  set changed_by = '00000000-0000-0000-0000-0000000000a1'
  where lead_id = '30000000-0000-4000-8000-000000000001' and changed_by is null;
select is(
  (select count(*)::int from public.lead_stage_history
     where lead_id = '30000000-0000-4000-8000-000000000001' and changed_by is null),
  2,
  'UPDATE em lead_stage_history não é permitido para authenticated — linhas com changed_by nulo continuam nulas'
);

delete from public.lead_stage_history where lead_id = '30000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.lead_stage_history where lead_id = '30000000-0000-4000-8000-000000000001'),
  3,
  'DELETE em lead_stage_history não é permitido para authenticated — linhas permanecem'
);

reset role;

select * from finish();
rollback;
