import type { LeadIntakeInput } from "@/lib/integrations/leads/schema";

// Tipado localmente pelo mesmo motivo de auth.ts: create_lead_from_integration
// (migration 20260906090700) ainda não existe em types/database.ts.
export interface CreateLeadFromIntegrationClient {
  rpc(
    fn: "create_lead_from_integration",
    args: {
      p_integration_credential_id: string;
      p_external_submission_id: string;
      p_lead: Record<string, unknown>;
      p_attribution: Record<string, unknown>;
      p_raw_payload: Record<string, unknown>;
    },
  ): Promise<{
    data:
      | Array<{
          lead_id: string;
          submission_id: string;
          is_new_lead: boolean;
          duplicate_submission: boolean;
        }>
      | null;
    error: { message: string } | null;
  }>;
}

export interface CreateLeadFromIntegrationResult {
  leadId: string;
  submissionId: string;
  isNewLead: boolean;
  duplicateSubmission: boolean;
}

// error.message carrega o marcador QARVON_* diretamente (raise_qarvon_error
// define a mensagem da exceção como o próprio marcador) — quem chama pode
// comparar error.message a um marcador conhecido (ex.: "QARVON_INVALID_WHATSAPP")
// sem precisar parsear texto humano.
export class LeadIntakeError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LeadIntakeError";
  }
}

// Monta p_lead só com as chaves realmente presentes (nunca chaves com
// undefined) — evita ruído em lead_submissions.raw_payload/p_lead e mantém
// a whitelist do lado do banco como única fonte de verdade sobre quais
// chaves são aceitas (não duplicamos essa lista aqui).
function buildLeadPayload(input: LeadIntakeInput): Record<string, unknown> {
  const lead: Record<string, unknown> = {
    name: input.name,
    whatsapp: input.whatsapp,
  };
  if (input.company != null) lead.company = input.company;
  if (input.revenue_range != null) lead.revenue_range = input.revenue_range;
  if (input.invests_paid_traffic != null) {
    lead.invests_paid_traffic = input.invests_paid_traffic;
  }
  return lead;
}

export async function createLeadFromIntegration(
  client: CreateLeadFromIntegrationClient,
  credentialId: string,
  input: LeadIntakeInput,
  rawPayload: unknown,
): Promise<CreateLeadFromIntegrationResult> {
  const { data, error } = await client.rpc("create_lead_from_integration", {
    p_integration_credential_id: credentialId,
    p_external_submission_id: input.external_submission_id,
    p_lead: buildLeadPayload(input),
    p_attribution: input.attribution ?? {},
    p_raw_payload: (rawPayload ?? {}) as Record<string, unknown>,
  });

  if (error) {
    throw new LeadIntakeError(error.message, error);
  }

  const row = data?.[0];
  if (!row) {
    throw new LeadIntakeError(
      "create_lead_from_integration não retornou nenhuma linha",
    );
  }

  return {
    leadId: row.lead_id,
    submissionId: row.submission_id,
    isNewLead: row.is_new_lead,
    duplicateSubmission: row.duplicate_submission,
  };
}
