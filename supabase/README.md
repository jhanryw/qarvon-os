# Supabase — Qarvon OS

Instância self-hosted, exclusiva do Qarvon OS (separada do ERP Santtorini). As
migrations em `migrations/` são SQL puro, independentes de qualquer projeto
Supabase Cloud — não dependem de `supabase link`.

## Desenvolvimento local (Supabase CLI + Docker)

Requer [Supabase CLI](https://supabase.com/docs/guides/cli) e Docker instalados
localmente (não disponíveis neste ambiente de execução do agente).

```bash
supabase start          # sobe Postgres + Auth + demais serviços via Docker
supabase db reset        # aplica migrations/ do zero contra o banco local
```

## Aplicar migrations na instância self-hosted (produção)

Migrations são arquivos `.sql` simples, aplicáveis com qualquer cliente
Postgres. Duas formas equivalentes, a definir quando a conexão real for
fornecida:

```bash
# Opção 1: psql direto, em ordem, parando no primeiro erro
for f in supabase/migrations/*.sql; do
  echo "Applying: $f"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f" || { echo "FALHOU em $f — pare e investigue antes de corrigir"; break; }
done

# Opção 2: Supabase CLI apontando para a instância via connection string
# (não usa "supabase link" / não trata o projeto como Supabase Cloud)
supabase db push --db-url "$SUPABASE_DB_URL"
```

Antes de aplicar, sempre confirme o destino da conexão (nunca Santtorini):

```sql
select current_database(), inet_server_addr(), inet_server_port();
```

**Importante (self-hosted):** `postgres` não é superuser nesta instância e
não é dono de tabelas criadas pelo próprio Supabase (`organizations`,
`profiles` pertencem a `supabase_admin`). `CREATE TABLE` novo funciona como
`postgres`, mas `ALTER TABLE` em objetos pré-existentes do Supabase exige
`supabase_admin` (o superuser real). Para consistência, DDL de schema deve
rodar como `supabase_admin`, não `postgres`.

Nunca aplicar alteração de schema manualmente fora de uma migration versionada.
Nunca editar uma migration já aplicada — criar uma nova.

## Geração de tipos TypeScript

`types/database.ts` é gerado a partir do schema real (homologado contra a
instância Qarvon self-hosted) — não é mais um placeholder manual. Ao alterar
o schema, regenerar:

```bash
# Ambiente local (supabase start)
supabase gen types typescript --local > types/database.ts

# Instância self-hosted, via connection string direta
# (a CLI usa docker internamente — rodar em uma máquina/host onde `docker`
# esteja disponível, não dentro de um container isolado sem acesso a ele)
supabase gen types typescript --db-url "$SUPABASE_DB_URL" > types/database.ts
```

## Bootstrap de organização e usuários

Ver [`BOOTSTRAP.md`](./BOOTSTRAP.md).

## Testes de RLS

Isolamento multi-tenant foi validado empiricamente contra a instância Qarvon
self-hosted real (não só revisão estática): `anon` sem acesso, `authenticated`
sem profile sem acesso, isolamento cross-tenant comprovado nos dois sentidos,
INSERT/UPDATE/DELETE bloqueados para `authenticated` nas duas tabelas — tudo
dentro de uma transação com dados temporários e `ROLLBACK` ao final (nenhum
dado de teste persistiu). Também existe
[`tests/database/rls_isolation.sql`](./tests/database/rls_isolation.sql)
(pgTAP, roda via `supabase test db`) para quem tiver o ambiente local do CLI.
