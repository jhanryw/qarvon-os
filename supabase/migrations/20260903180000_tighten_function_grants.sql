-- Achado em homologação contra a instância self-hosted real: o Supabase
-- concede EXECUTE em novas funções diretamente a anon/authenticated/
-- service_role via default privileges do próprio bootstrap (não via a role
-- PUBLIC), então o "revoke ... from public" da migration 20260903120300 não
-- atinge esses grants nomeados. current_profile_organization_id() só lê o
-- profile do próprio auth.uid() (NULL para anon, então sem vazamento de
-- dado), mas não deveria ser executável por quem não é "authenticated".

revoke execute on function public.current_profile_organization_id() from anon;
revoke execute on function public.current_profile_organization_id() from service_role;
