-- Testa que um usuário autenticado só enxerga a própria organização e o
-- próprio profile, mesmo existindo dados de outra organização no banco.
--
-- Executar com: supabase test db
-- (depende do Supabase CLI + Docker; não executável no ambiente deste agente)

begin;
select plan(4);

-- Duas organizações e dois usuários/profiles, um em cada.
insert into public.organizations (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Org A'),
  ('00000000-0000-0000-0000-000000000002', 'Org B');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'user-a@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'user-b@example.com');

insert into public.profiles (id, organization_id, name, email, role) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'User A', 'user-a@example.com', 'ADMIN'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000002', 'User B', 'user-b@example.com', 'ADMIN');

-- Simula sessão autenticada como User A.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

select is(
  (select count(*)::int from public.organizations),
  1,
  'usuário A só enxerga a própria organização'
);

select is(
  (select name from public.organizations limit 1),
  'Org A',
  'organização visível é a Org A'
);

select is(
  (select count(*)::int from public.profiles),
  1,
  'usuário A só enxerga o próprio profile'
);

select is(
  (select id::text from public.profiles limit 1),
  '00000000-0000-0000-0000-0000000000a1',
  'profile visível é o do próprio usuário A'
);

select * from finish();
rollback;
