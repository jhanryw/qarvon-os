-- Registro de cada submissão processada por create_lead_from_integration —
-- tanto a que cria um lead novo quanto a que reaproveita um lead OPEN
-- existente ("retorno"). Uma submissão só existe como linha se o
-- processamento terminou com sucesso: a transação inteira commita ou não
-- commita nada, então uma tentativa que falhou (payload inválido, token
-- inválido) nunca chega a inserir aqui — não existe status "falhou" de
-- propósito.
--
-- leads 1:N lead_submissions 1:1 lead_attribution (ver
-- 20260906090600_create_lead_attribution.sql): cada submissão, nova ou de
-- retorno, é seu próprio evento com sua própria atribuição, nunca
-- sobrescrevendo a anterior — histórico completo de toques preservado.
--
-- external_submission_id é a chave de idempotência da integração, única
-- por credencial (não globalmente: duas integrações diferentes podem
-- coincidentemente gerar o mesmo valor sem colisão real).
create table public.lead_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  lead_id uuid not null,
  integration_credential_id uuid not null,
  external_submission_id text not null,
  is_new_lead boolean not null,
  raw_payload jsonb not null,
  created_at timestamptz not null default now(),

  constraint lead_submissions_external_submission_id_not_blank
    check (length(trim(external_submission_id)) > 0),

  -- Alvo de FK composta para lead_attribution.submission_id.
  constraint lead_submissions_id_organization_id_key unique (id, organization_id),

  -- Constraint de banco para idempotência — não é proteção só em
  -- TypeScript. create_lead_from_integration trata a violação desta
  -- constraint explicitamente (captura unique_violation) para o caso de
  -- duas submissões concorrentes com o mesmo external_submission_id.
  constraint lead_submissions_external_id_per_credential
    unique (integration_credential_id, external_submission_id),

  constraint lead_submissions_lead_same_organization
    foreign key (lead_id, organization_id)
    references public.leads (id, organization_id),
  constraint lead_submissions_credential_same_organization
    foreign key (integration_credential_id, organization_id)
    references public.integration_credentials (id, organization_id)
);

-- Timeline do lead (histórico de submissões na página do lead).
create index lead_submissions_lead_id_created_at_idx
  on public.lead_submissions (lead_id, created_at desc);

-- Dashboards/auditoria por organização.
create index lead_submissions_organization_id_created_at_idx
  on public.lead_submissions (organization_id, created_at desc);

alter table public.lead_submissions enable row level security;

create policy lead_submissions_select_own_org
  on public.lead_submissions
  for select
  to authenticated
  using (organization_id = public.current_profile_organization_id());

-- Deliberadamente sem policy de INSERT/UPDATE/DELETE para authenticated:
-- mesma razão de lead_stage_history (M2.1) — a escrita é consequência de
-- uma submissão real processada por create_lead_from_integration, não um
-- dado que o client escreve diretamente.
