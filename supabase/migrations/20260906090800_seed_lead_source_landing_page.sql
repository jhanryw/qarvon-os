-- Cria a lead_source "Landing Page — Site Qarvon" para toda organização
-- existente, de forma genérica (INSERT ... SELECT a partir de
-- organizations — nunca um UUID de organização hardcoded) e idempotente,
-- mesmo padrão de 20260904001500_seed_default_pipeline_and_stages.sql.
--
-- Representa o CANAL de chegada (site/LP), não a plataforma de anúncio
-- específica — essa granularidade (Meta, Google, orgânico) já é capturada
-- em lead_attribution.utm_source por submissão, não aqui.
--
-- Não seeda integration_credentials nesta migration, de propósito: uma
-- credencial exige um token real gerado fora de banco — não existe um
-- valor determinístico e seguro para gerar aqui. Provisionamento de
-- credencial é um passo manual documentado em supabase/BOOTSTRAP.md, mesmo
-- padrão já usado para vínculo de profile a organização.
insert into public.lead_sources (organization_id, name, active)
select id, 'Landing Page — Site Qarvon', true
from public.organizations
on conflict (organization_id, name) do nothing;
