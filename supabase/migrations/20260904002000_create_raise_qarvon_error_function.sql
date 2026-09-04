-- Helper interno usado pelas RPCs do M2.2A para levantar exceções com um
-- contrato estável (SQLSTATE customizado + marcador na mensagem), em vez de
-- depender de texto humano do Postgres — evita que o client precise "parsear"
-- frases que podem mudar de redação. Só constrói e levanta a exceção; não lê
-- nem escreve nenhuma tabela, então não precisa de SECURITY DEFINER.
--
-- Deliberadamente sem EXECUTE para nenhuma role client-facing (nem
-- "authenticated"): não é um endpoint útil por si só, só uma função interna
-- chamada de dentro de outra função SECURITY DEFINER. Dentro de uma função
-- SECURITY DEFINER, o "usuário efetivo" passa a ser o owner da função
-- chamadora (supabase_admin) pela duração da execução — owners/superusers
-- não passam pela checagem de EXECUTE explícito, então a chamada interna
-- funciona mesmo com EXECUTE revogado de todo mundo. Revisar isso
-- empiricamente contra a instância real após aplicar esta migration.

create or replace function public.raise_qarvon_error(p_marker text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'QV001', message = p_marker;
end;
$$;

revoke execute on function public.raise_qarvon_error(text) from public;
revoke execute on function public.raise_qarvon_error(text) from anon;
revoke execute on function public.raise_qarvon_error(text) from authenticated;
revoke execute on function public.raise_qarvon_error(text) from service_role;
