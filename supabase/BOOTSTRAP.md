# Bootstrap de organização e usuários

A organização Qarvon é criada por migration (idempotente, ver
`migrations/20260903120400_seed_qarvon_organization.sql`).

Não existe trigger automático que vincule um novo usuário do Auth a uma
organização: criar uma conta em `auth.users` não concede acesso por si só. O
vínculo do `profile` a uma `organization` é um passo administrativo explícito,
feito com a service role (que ignora RLS).

## Procedimento para vincular um usuário

1. Criar o usuário no Supabase Auth (painel administrativo da instância
   self-hosted, ou `supabase auth admin create-user` / API admin). Anotar o
   `id` (UUID) gerado.

2. Vincular o profile explicitamente, como service role (nunca a partir do
   client/app), por exemplo via `psql` contra a instância:

   ```sql
   insert into public.profiles (id, organization_id, name, email, role, active)
   values (
     '<uuid-do-usuario-no-auth>',
     (select id from public.organizations where name = 'Qarvon'),
     'Nome da pessoa',
     'email@qarvon.com',
     'ADMIN', -- ou 'SALES'
     true
   );
   ```

3. Confirmar o acesso: login na aplicação deve levar ao dashboard. Sem esse
   passo, o usuário autenticado cai na tela `/sem-acesso`.

Este procedimento manual é aceitável enquanto existir apenas uma organização
(escopo atual). Se o produto evoluir para múltiplas organizações, definir um
fluxo de convite antes de expandir esse processo.
