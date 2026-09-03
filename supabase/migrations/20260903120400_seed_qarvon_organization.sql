-- Cria a organização Qarvon de forma idempotente (a constraint unique em
-- organizations.name garante isso no nível do banco, inclusive sob
-- concorrência). O vínculo dos primeiros profiles a esta organização é feito
-- manualmente (ver supabase/BOOTSTRAP.md), não por trigger automático.

insert into public.organizations (name, timezone)
values ('Qarvon', 'America/Sao_Paulo')
on conflict (name) do nothing;
