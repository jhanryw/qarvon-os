-- Helper puro para a advisory lock transacional usada por
-- create_lead_from_integration (migration
-- 20260906090700_create_create_lead_from_integration_function.sql) para
-- serializar, por organização + WhatsApp normalizado, a decisão entre
-- "criar lead novo" e "reaproveitar lead OPEN existente". Sem isso, duas
-- submissões concorrentes do mesmo WhatsApp (com external_submission_id
-- diferentes) poderiam ambas decidir "não existe lead aberto" antes de
-- qualquer uma commitar, resultando em dois leads OPEN para a mesma pessoa.
--
-- IMMUTABLE: não lê nenhuma tabela — a mesma entrada sempre produz a mesma
-- saída, só concatena e hasheia. hashtextextended é builtin do Postgres
-- (>= 9.5, já usado internamente para hash index/partitioning); aqui não
-- precisamos de nenhuma propriedade criptográfica, só de uma chave
-- determinística bem distribuída no espaço de 64 bits que
-- pg_advisory_xact_lock espera como argumento. Seed fixo (0), sem
-- necessidade de variar por chamada.
--
-- Colisão (duas entradas diferentes produzindo a mesma chave) nunca causa
-- resultado incorreto — só faria duas org+whatsapp diferentes serializarem
-- desnecessariamente entre si por uma fração de segundo. Nunca faz o
-- inverso (duas chamadas para a MESMA org+whatsapp deixarem de serializar),
-- porque a função é determinística. Com o volume esperado de submissões
-- simultâneas, a probabilidade de colisão no espaço de 64 bits é
-- irrelevante na prática.
--
-- Sem grant para nenhuma role: helper interno, mesma classe de
-- raise_qarvon_error — só chamável de dentro de outra função SECURITY
-- DEFINER (o "usuário efetivo" nessa chamada aninhada é o owner da função
-- chamadora, que ignora EXECUTE revogado).
create or replace function public._lead_whatsapp_lock_key(
  p_organization_id uuid,
  p_whatsapp_normalized text
) returns bigint
language sql
immutable
set search_path = ''
as $$
  select hashtextextended(p_organization_id::text || ':' || p_whatsapp_normalized, 0);
$$;

revoke execute on function public._lead_whatsapp_lock_key(uuid, text) from public;
revoke execute on function public._lead_whatsapp_lock_key(uuid, text) from anon;
revoke execute on function public._lead_whatsapp_lock_key(uuid, text) from authenticated;
revoke execute on function public._lead_whatsapp_lock_key(uuid, text) from service_role;
