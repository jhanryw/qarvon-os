-- Extensão para gen_random_uuid() e função utilitária de updated_at,
-- compartilhadas pelas tabelas do M0.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
