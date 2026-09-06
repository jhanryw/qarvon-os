-- Normalização canônica (E.164) de WhatsApp, usada por
-- _create_lead_with_pipeline_core (migration
-- 20260906090300_extract_create_lead_core_function.sql) para popular
-- leads.whatsapp_normalized em toda criação de lead (humana ou por
-- integração) e por create_lead_from_integration para a busca de
-- deduplicação. Não confundir com leads.whatsapp, que continua guardando o
-- valor bruto como foi digitado/recebido, sem normalização — essa coluna
-- não muda de significado.
--
-- Assume Brasil quando o número não traz código de país (mesma suposição
-- já feita hoje pela LP em lib/phone.ts). Formato não reconhecido retorna
-- NULL em vez de uma normalização inventada: um valor sintético poderia
-- colidir falsamente com outro número igualmente malformado na busca de
-- dedup, o que é pior do que simplesmente não deduplicar aquele caso.
--
-- IMMUTABLE: não lê nenhuma tabela, determinístico.
create or replace function public._normalize_whatsapp_br(p_whatsapp text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_digits text;
begin
  if p_whatsapp is null then
    return null;
  end if;

  v_digits := regexp_replace(p_whatsapp, '\D', '', 'g');

  if v_digits = '' then
    return null;
  end if;

  -- Já com código do país: 55 + DDD (2) + número (8 ou 9 dígitos).
  if length(v_digits) in (12, 13) and left(v_digits, 2) = '55' then
    return '+' || v_digits;
  end if;

  -- Sem código do país: DDD (2) + número (8 ou 9 dígitos) — assume Brasil.
  if length(v_digits) in (10, 11) then
    return '+55' || v_digits;
  end if;

  return null;
end;
$$;

revoke execute on function public._normalize_whatsapp_br(text) from public;
revoke execute on function public._normalize_whatsapp_br(text) from anon;
revoke execute on function public._normalize_whatsapp_br(text) from authenticated;
revoke execute on function public._normalize_whatsapp_br(text) from service_role;
