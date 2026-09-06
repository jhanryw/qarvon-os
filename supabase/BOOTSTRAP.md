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

## Procedimento para provisionar uma credencial de integração

`public.integration_credentials` (migration
`20260906090400_create_integration_credentials.sql`) não é seedada com
nenhuma linha por migration — um token real não pode ser gerado de forma
determinística num arquivo versionado. Provisionar uma credencial nova
(ex.: para a LP pública) é um passo manual, análogo ao vínculo de profile
acima.

1. Gerar o token em texto puro, uma vez, fora de qualquer ambiente de
   produção:

   ```bash
   openssl rand -base64 32
   ```

2. Calcular o hash com o **mesmo** valor de `INTEGRATION_TOKEN_PEPPER` que
   está configurado no ambiente do Qarvon OS (nunca um pepper diferente —
   o hash só verifica contra o pepper que gerou ele). Exemplo em Node:

   ```bash
   node -e "
     const crypto = require('crypto');
     const token = '<token do passo 1>';
     const pepper = '<INTEGRATION_TOKEN_PEPPER do ambiente>';
     console.log(crypto.createHmac('sha256', pepper).update(token).digest('hex'));
   "
   ```

3. Inserir a credencial, como service role (nunca a partir do client/app),
   apontando para a lead_source já seedada por
   `20260906090800_seed_lead_source_landing_page.sql`:

   ```sql
   insert into public.integration_credentials (
     organization_id, slug, token_hash, default_lead_source_id, active
   )
   values (
     (select id from public.organizations where name = 'Qarvon'),
     'lp-qarvon',
     '<hash do passo 2>',
     (
       select id from public.lead_sources
       where organization_id = (select id from public.organizations where name = 'Qarvon')
         and name = 'Landing Page — Site Qarvon'
     ),
     true
   );
   ```

4. Entregar o token em texto puro (passo 1) só para quem configura o
   ambiente da LP (env/secret manager dela). O Qarvon OS nunca armazena o
   token em texto puro em lugar nenhum — só o pepper (env) e o hash (banco).

Rotação: repetir os passos 1-2 com um token novo, depois
`update public.integration_credentials set token_hash = '<novo hash>' where slug = 'lp-qarvon'`,
e atualizar o secret do lado da LP. Desativar uma credencial comprometida
sem rotacionar: `update public.integration_credentials set active = false where slug = '...'`.
