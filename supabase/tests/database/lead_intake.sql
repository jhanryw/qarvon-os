-- Testa create_lead_from_integration (M2.2B) e os helpers privados que ela
-- usa: fronteira de segurança (grants), idempotência, deduplicação por
-- WhatsApp + estágio OPEN, comportamento WON/LOST, isolamento cross-tenant.
--
-- NÃO testa a advisory lock sob concorrência real — pgTAP roda numa única
-- sessão/transação, sequencialmente, e não consegue expressar duas
-- transações verdadeiramente simultâneas disputando a mesma lock. Esse
-- cenário tem um teste dedicado, não-pgTAP, em
-- vitest/lead-intake-concurrency.test.ts.
--
-- Executar com: supabase test db
-- (depende do Supabase CLI + Docker; não executável no ambiente deste
-- agente — mesma limitação já documentada em pipeline_rpc.sql e
-- rls_isolation.sql. Este arquivo foi escrito e revisado estaticamente,
-- NÃO executado nem validado contra um Postgres real.)

begin;
select plan(51);

-- ---------------------------------------------------------------------
-- Setup (como owner da tabela)
-- ---------------------------------------------------------------------

create temporary table test_scratch (key text primary key, value text);

insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-000000000010', 'Org G (integração)'),
  ('00000000-0000-0000-0000-000000000011', 'Org H (integração, outro tenant)');

insert into public.pipelines (id, organization_id, name, is_default, active) values
  ('10000000-0000-4000-8000-000000000010', '00000000-0000-0000-0000-000000000010', 'Pipeline G (default)', true, true),
  ('10000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000011', 'Pipeline H (default)', true, true);

insert into public.pipeline_stages (id, organization_id, pipeline_id, name, position, probability, stage_type, active) values
  ('20000000-0000-4000-8000-000000000101', '00000000-0000-0000-0000-000000000010', '10000000-0000-4000-8000-000000000010', 'Novo Lead G', 1, 5, 'OPEN', true),
  ('20000000-0000-4000-8000-000000000102', '00000000-0000-0000-0000-000000000010', '10000000-0000-4000-8000-000000000010', 'Fechado G', 2, 100, 'WON', true),
  ('20000000-0000-4000-8000-000000000103', '00000000-0000-0000-0000-000000000010', '10000000-0000-4000-8000-000000000010', 'Perdido G', 3, 0, 'LOST', true),
  ('20000000-0000-4000-8000-000000000111', '00000000-0000-0000-0000-000000000011', '10000000-0000-4000-8000-000000000011', 'Novo Lead H', 1, 5, 'OPEN', true);

insert into public.lead_sources (id, organization_id, name, active) values
  ('50000000-0000-4000-8000-000000000010', '00000000-0000-0000-0000-000000000010', 'Landing Page G', true),
  ('50000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000011', 'Landing Page H', true);

-- Lead já fechado (WON) em Org G, mesmo WhatsApp que será usado no cenário
-- 4 — para provar que create_lead_from_integration NÃO reabre/reaproveita.
insert into public.leads (id, organization_id, name, pipeline_id, stage_id, whatsapp_normalized) values
  ('30000000-0000-4000-8000-000000000201', '00000000-0000-0000-0000-000000000010', 'Lead Fechado G', '10000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000102', '+5511988887777');

insert into public.integration_credentials (id, organization_id, slug, token_hash, default_lead_source_id, active) values
  ('60000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000010', 'test-g', 'hash-g', '50000000-0000-4000-8000-000000000010', true),
  ('60000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000010', 'test-g-inactive', 'hash-g-inactive', '50000000-0000-4000-8000-000000000010', false),
  ('60000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000010', 'test-g-nosource', 'hash-g-nosource', null, true),
  ('60000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000011', 'test-h', 'hash-h', '50000000-0000-4000-8000-000000000011', true);

-- ---------------------------------------------------------------------
-- Grants (owner-level, independente de role) — 12 assertions
-- ---------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.create_lead_from_integration(uuid, text, jsonb, jsonb, jsonb)', 'EXECUTE'),
  'anon não tem EXECUTE em create_lead_from_integration'
);
select ok(
  not has_function_privilege('authenticated', 'public.create_lead_from_integration(uuid, text, jsonb, jsonb, jsonb)', 'EXECUTE'),
  'authenticated não tem EXECUTE em create_lead_from_integration'
);
select ok(
  has_function_privilege('service_role', 'public.create_lead_from_integration(uuid, text, jsonb, jsonb, jsonb)', 'EXECUTE'),
  'service_role tem EXECUTE em create_lead_from_integration (único caminho de chamada real)'
);

select ok(
  not has_function_privilege('anon', 'public._lead_whatsapp_lock_key(uuid, text)', 'EXECUTE'),
  'anon não tem EXECUTE em _lead_whatsapp_lock_key'
);
select ok(
  not has_function_privilege('authenticated', 'public._lead_whatsapp_lock_key(uuid, text)', 'EXECUTE'),
  'authenticated não tem EXECUTE em _lead_whatsapp_lock_key'
);
select ok(
  not has_function_privilege('service_role', 'public._lead_whatsapp_lock_key(uuid, text)', 'EXECUTE'),
  'service_role não tem EXECUTE em _lead_whatsapp_lock_key (helper interno, não é endpoint)'
);

select ok(
  not has_function_privilege('anon', 'public._normalize_whatsapp_br(text)', 'EXECUTE'),
  'anon não tem EXECUTE em _normalize_whatsapp_br'
);
select ok(
  not has_function_privilege('authenticated', 'public._normalize_whatsapp_br(text)', 'EXECUTE'),
  'authenticated não tem EXECUTE em _normalize_whatsapp_br'
);
select ok(
  not has_function_privilege('service_role', 'public._normalize_whatsapp_br(text)', 'EXECUTE'),
  'service_role não tem EXECUTE em _normalize_whatsapp_br (helper interno, não é endpoint)'
);

select ok(
  not has_function_privilege('anon', 'public._create_lead_with_pipeline_core(uuid, uuid, uuid, uuid, jsonb)', 'EXECUTE'),
  'anon não tem EXECUTE em _create_lead_with_pipeline_core'
);
select ok(
  not has_function_privilege('authenticated', 'public._create_lead_with_pipeline_core(uuid, uuid, uuid, uuid, jsonb)', 'EXECUTE'),
  'authenticated não tem EXECUTE em _create_lead_with_pipeline_core'
);
select ok(
  not has_function_privilege('service_role', 'public._create_lead_with_pipeline_core(uuid, uuid, uuid, uuid, jsonb)', 'EXECUTE'),
  'service_role não tem EXECUTE em _create_lead_with_pipeline_core (helper interno, não é endpoint)'
);

-- ---------------------------------------------------------------------
-- Cenário 1: lead novo via credencial G — 10 assertions
-- ---------------------------------------------------------------------

do $$
declare
  v_result record;
begin
  select * into v_result from public.create_lead_from_integration(
    '60000000-0000-4000-8000-000000000001',
    'sub-001',
    '{"name": "Lead Novo G", "whatsapp": "(11) 99999-1111", "invests_paid_traffic": true}'::jsonb,
    '{"utm_source": "meta", "fbclid": "fb.1.123"}'::jsonb,
    '{"marker": "sub-001"}'::jsonb
  );
  insert into test_scratch (key, value) values
    ('s1_lead_id', v_result.lead_id::text),
    ('s1_submission_id', v_result.submission_id::text),
    ('s1_is_new_lead', v_result.is_new_lead::text),
    ('s1_duplicate', v_result.duplicate_submission::text);
end;
$$;

select is(
  (select value from test_scratch where key = 's1_is_new_lead'), 'true',
  'cenário 1: is_new_lead = true'
);
select is(
  (select value from test_scratch where key = 's1_duplicate'), 'false',
  'cenário 1: duplicate_submission = false'
);
select is(
  (select organization_id::text from public.leads where id = (select value::uuid from test_scratch where key = 's1_lead_id')),
  '00000000-0000-0000-0000-000000000010',
  'cenário 1: lead nasce na organização da credencial'
);
select is(
  (select stage_id::text from public.leads where id = (select value::uuid from test_scratch where key = 's1_lead_id')),
  '20000000-0000-4000-8000-000000000101',
  'cenário 1: lead nasce na stage OPEN do pipeline default'
);
select is(
  (select lead_source_id::text from public.leads where id = (select value::uuid from test_scratch where key = 's1_lead_id')),
  '50000000-0000-4000-8000-000000000010',
  'cenário 1: lead_source_id resolvido a partir de default_lead_source_id da credencial'
);
select is(
  (select owner_id from public.leads where id = (select value::uuid from test_scratch where key = 's1_lead_id')),
  null,
  'cenário 1: owner_id nulo (sem responsável humano na criação por integração)'
);
select is(
  (select whatsapp_normalized from public.leads where id = (select value::uuid from test_scratch where key = 's1_lead_id')),
  '+5511999991111',
  'cenário 1: whatsapp_normalized calculado corretamente (E.164)'
);
select is(
  (select invests_paid_traffic::text from public.leads where id = (select value::uuid from test_scratch where key = 's1_lead_id')),
  'true',
  'cenário 1: invests_paid_traffic passa pela whitelist e é persistido'
);
select is(
  (select count(*)::int from public.lead_stage_history
     where lead_id = (select value::uuid from test_scratch where key = 's1_lead_id')
       and from_pipeline_id is null and from_stage_id is null and changed_by is null),
  1,
  'cenário 1: bootstrap de lead_stage_history com from_* nulo e changed_by nulo'
);
select is(
  (select attribution.utm_source from public.lead_attribution attribution
     where attribution.submission_id = (select value::uuid from test_scratch where key = 's1_submission_id')),
  'meta',
  'cenário 1: lead_attribution grava utm_source vindo do payload'
);

-- ---------------------------------------------------------------------
-- Cenário 2: replay idempotente do mesmo external_submission_id — 6 assertions
-- ---------------------------------------------------------------------

do $$
declare
  v_result record;
begin
  select * into v_result from public.create_lead_from_integration(
    '60000000-0000-4000-8000-000000000001',
    'sub-001',
    '{"name": "Lead Novo G", "whatsapp": "(11) 99999-1111", "invests_paid_traffic": true}'::jsonb,
    '{"utm_source": "meta"}'::jsonb,
    '{"marker": "sub-001-replay"}'::jsonb
  );
  insert into test_scratch (key, value) values
    ('s2_lead_id', v_result.lead_id::text),
    ('s2_submission_id', v_result.submission_id::text),
    ('s2_is_new_lead', v_result.is_new_lead::text),
    ('s2_duplicate', v_result.duplicate_submission::text);
end;
$$;

select is(
  (select value from test_scratch where key = 's2_lead_id'),
  (select value from test_scratch where key = 's1_lead_id'),
  'cenário 2: replay retorna o mesmo lead_id'
);
select is(
  (select value from test_scratch where key = 's2_submission_id'),
  (select value from test_scratch where key = 's1_submission_id'),
  'cenário 2: replay retorna o mesmo submission_id'
);
select is(
  (select value from test_scratch where key = 's2_is_new_lead'), 'true',
  'cenário 2: replay preserva is_new_lead do processamento original'
);
select is(
  (select value from test_scratch where key = 's2_duplicate'), 'true',
  'cenário 2: replay marca duplicate_submission = true'
);
select is(
  (select count(*)::int from public.lead_submissions where external_submission_id = 'sub-001'),
  1,
  'cenário 2: replay não cria segunda linha em lead_submissions'
);
select is(
  (select count(*)::int from public.lead_attribution where submission_id = (select value::uuid from test_scratch where key = 's1_submission_id')),
  1,
  'cenário 2: replay não cria segunda linha em lead_attribution'
);

-- ---------------------------------------------------------------------
-- Cenário 3: lead retornando (mesmo WhatsApp, novo external_submission_id) — 7 assertions
-- ---------------------------------------------------------------------

do $$
declare
  v_result record;
begin
  select * into v_result from public.create_lead_from_integration(
    '60000000-0000-4000-8000-000000000001',
    'sub-002',
    '{"name": "Lead Novo G", "whatsapp": "(11) 99999-1111"}'::jsonb,
    '{"utm_source": "google"}'::jsonb,
    '{"marker": "sub-002"}'::jsonb
  );
  insert into test_scratch (key, value) values
    ('s3_lead_id', v_result.lead_id::text),
    ('s3_is_new_lead', v_result.is_new_lead::text),
    ('s3_duplicate', v_result.duplicate_submission::text);
end;
$$;

select is(
  (select value from test_scratch where key = 's3_is_new_lead'), 'false',
  'cenário 3: WhatsApp igual + lead OPEN existente => is_new_lead = false (retorno)'
);
select is(
  (select value from test_scratch where key = 's3_duplicate'), 'false',
  'cenário 3: retorno não é idempotência (external_submission_id é novo)'
);
select is(
  (select value from test_scratch where key = 's3_lead_id'),
  (select value from test_scratch where key = 's1_lead_id'),
  'cenário 3: retorno reaproveita o MESMO lead do cenário 1'
);
select isnt(
  (select last_intake_at from public.leads where id = (select value::uuid from test_scratch where key = 's1_lead_id')),
  null,
  'cenário 3: last_intake_at é atualizado no retorno'
);
select is(
  (select stage_id::text from public.leads where id = (select value::uuid from test_scratch where key = 's1_lead_id')),
  '20000000-0000-4000-8000-000000000101',
  'cenário 3: retorno NÃO move o lead de estágio'
);
select is(
  (select count(*)::int from public.lead_submissions where lead_id = (select value::uuid from test_scratch where key = 's1_lead_id')),
  2,
  'cenário 3: agora existem 2 submissões para o mesmo lead (nova + retorno)'
);
select is(
  (select count(*)::int from public.lead_stage_history where lead_id = (select value::uuid from test_scratch where key = 's1_lead_id')),
  1,
  'cenário 3: retorno NÃO cria novo evento em lead_stage_history'
);

-- ---------------------------------------------------------------------
-- Cenário 4: WhatsApp igual a um lead WON existente => cria lead NOVO,
-- nunca reabre — 4 assertions
-- ---------------------------------------------------------------------

do $$
declare
  v_result record;
begin
  select * into v_result from public.create_lead_from_integration(
    '60000000-0000-4000-8000-000000000001',
    'sub-003',
    '{"name": "Lead Pos-Venda G", "whatsapp": "(11) 98888-7777"}'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb
  );
  insert into test_scratch (key, value) values
    ('s4_lead_id', v_result.lead_id::text),
    ('s4_is_new_lead', v_result.is_new_lead::text);
end;
$$;

select is(
  (select value from test_scratch where key = 's4_is_new_lead'), 'true',
  'cenário 4: WhatsApp igual a lead WON => cria lead novo (não reabre)'
);
select isnt(
  (select value from test_scratch where key = 's4_lead_id'),
  '30000000-0000-4000-8000-000000000201',
  'cenário 4: o lead novo não é o mesmo id do lead WON pré-existente'
);
select is(
  (select stage_id::text from public.leads where id = (select value::uuid from test_scratch where key = 's4_lead_id')),
  '20000000-0000-4000-8000-000000000101',
  'cenário 4: o lead novo nasce em OPEN, não em WON'
);
select is(
  (select count(*)::int from public.leads where organization_id = '00000000-0000-0000-0000-000000000010' and whatsapp_normalized = '+5511988887777'),
  2,
  'cenário 4: agora existem 2 leads distintos com este WhatsApp na organização (o WON antigo + o novo)'
);

-- ---------------------------------------------------------------------
-- Cenário 5: isolamento cross-tenant — mesmo WhatsApp do cenário 1, mas via
-- credencial de Org H, não deve enxergar/reaproveitar o lead de Org G — 3 assertions
-- ---------------------------------------------------------------------

do $$
declare
  v_result record;
begin
  select * into v_result from public.create_lead_from_integration(
    '60000000-0000-4000-8000-000000000004',
    'sub-h-001',
    '{"name": "Lead H", "whatsapp": "(11) 99999-1111"}'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb
  );
  insert into test_scratch (key, value) values
    ('s5_lead_id', v_result.lead_id::text),
    ('s5_is_new_lead', v_result.is_new_lead::text);
end;
$$;

select is(
  (select value from test_scratch where key = 's5_is_new_lead'), 'true',
  'cenário 5: credencial de outra organização não reaproveita lead OPEN de Org G com o mesmo WhatsApp'
);
select is(
  (select organization_id::text from public.leads where id = (select value::uuid from test_scratch where key = 's5_lead_id')),
  '00000000-0000-0000-0000-000000000011',
  'cenário 5: o lead novo pertence a Org H, não a Org G'
);
select isnt(
  (select value from test_scratch where key = 's5_lead_id'),
  (select value from test_scratch where key = 's1_lead_id'),
  'cenário 5: é um lead diferente do de Org G, mesmo com WhatsApp idêntico'
);

-- ---------------------------------------------------------------------
-- Cenário 6: credencial sem default_lead_source_id => lead_source_id fica
-- nulo, sem erro — 2 assertions
-- ---------------------------------------------------------------------

do $$
declare
  v_result record;
begin
  select * into v_result from public.create_lead_from_integration(
    '60000000-0000-4000-8000-000000000003',
    'sub-nosource-001',
    '{"name": "Lead Sem Source", "whatsapp": "(11) 97777-6666"}'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb
  );
  insert into test_scratch (key, value) values ('s6_lead_id', v_result.lead_id::text);
end;
$$;

select is(
  (select lead_source_id from public.leads where id = (select value::uuid from test_scratch where key = 's6_lead_id')),
  null,
  'cenário 6: credencial sem default_lead_source_id gera lead com lead_source_id nulo'
);
select is(
  (select organization_id::text from public.leads where id = (select value::uuid from test_scratch where key = 's6_lead_id')),
  '00000000-0000-0000-0000-000000000010',
  'cenário 6: ainda assim resolve a organização corretamente'
);

-- ---------------------------------------------------------------------
-- Cenário 7: erros esperados (entrada inválida) — 6 assertions
-- ---------------------------------------------------------------------

select throws_ok(
  $$ select public.create_lead_from_integration(
       '60000000-0000-4000-8000-000000000002', 'sub-inativa', '{"name":"x","whatsapp":"11999999999"}'::jsonb, '{}'::jsonb, '{}'::jsonb
     ) $$,
  'QV001',
  'credencial inativa: QARVON_INVALID_CREDENTIAL'
);
select throws_ok(
  $$ select public.create_lead_from_integration(
       '60000000-0000-4000-8000-000000000099', 'sub-inexistente', '{"name":"x","whatsapp":"11999999999"}'::jsonb, '{}'::jsonb, '{}'::jsonb
     ) $$,
  'QV001',
  'credencial inexistente: QARVON_INVALID_CREDENTIAL'
);
select throws_ok(
  $$ select public.create_lead_from_integration(
       '60000000-0000-4000-8000-000000000001', '', '{"name":"x","whatsapp":"11999999999"}'::jsonb, '{}'::jsonb, '{}'::jsonb
     ) $$,
  'QV001',
  'external_submission_id vazio: QARVON_INVALID_INPUT'
);
select throws_ok(
  $$ select public.create_lead_from_integration(
       '60000000-0000-4000-8000-000000000001', null, '{"name":"x","whatsapp":"11999999999"}'::jsonb, '{}'::jsonb, '{}'::jsonb
     ) $$,
  'QV001',
  'external_submission_id nulo: QARVON_INVALID_INPUT'
);
select throws_ok(
  $$ select public.create_lead_from_integration(
       '60000000-0000-4000-8000-000000000001', 'sub-chave-errada', '{"name":"x","whatsapp":"11999999999","foo":"bar"}'::jsonb, '{}'::jsonb, '{}'::jsonb
     ) $$,
  'QV001',
  'chave desconhecida no payload (foo): QARVON_INVALID_INPUT'
);
select throws_ok(
  $$ select public.create_lead_from_integration(
       '60000000-0000-4000-8000-000000000001', 'sub-whatsapp-invalido', '{"name":"x","whatsapp":"123"}'::jsonb, '{}'::jsonb, '{}'::jsonb
     ) $$,
  'QV001',
  'WhatsApp em formato irreconhecível: QARVON_INVALID_WHATSAPP'
);

-- ---------------------------------------------------------------------
-- Regressão rápida: nenhum dos erros acima deixou rastro
-- (nenhuma linha inserida por chamada que lançou exceção) — 1 assertion
-- ---------------------------------------------------------------------

select is(
  (select count(*)::int from public.lead_submissions
     where external_submission_id in ('sub-inativa', 'sub-inexistente', '', 'sub-chave-errada', 'sub-whatsapp-invalido')),
  0,
  'nenhuma chamada que lançou exceção deixou linha em lead_submissions (transação abortada)'
);

select * from finish();
rollback;
