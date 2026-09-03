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

Nunca aplicar alteração de schema manualmente fora de uma migration versionada.
Nunca editar uma migration já aplicada — criar uma nova.

## Geração de tipos TypeScript

`types/database.ts` hoje é escrito manualmente, no formato de saída do CLI,
como placeholder até haver conexão com um banco real.

```bash
# Ambiente local (supabase start)
supabase gen types typescript --local > types/database.ts

# Instância self-hosted, via connection string direta
supabase gen types typescript --db-url "$SUPABASE_DB_URL" > types/database.ts
```

## Bootstrap de organização e usuários

Ver [`BOOTSTRAP.md`](./BOOTSTRAP.md).

## Testes de RLS

Ver [`tests/database/rls_isolation.sql`](./tests/database/rls_isolation.sql)
(pgTAP, roda via `supabase test db` — depende do ambiente local do CLI, não
executável neste ambiente do agente).
