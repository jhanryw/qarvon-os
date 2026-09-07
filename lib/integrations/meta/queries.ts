import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { AppError, mapQarvonError } from "@/lib/errors";

export interface MetaIntegrationSettings {
  pixelId: string | null;
  conversionValueMode: "MRR" | "TCV";
  active: boolean;
  hasAccessToken: boolean;
}

// Nunca retorna o access_token em si — só has_access_token (derivado). A
// RPC (get_meta_integration_settings) já garante isso no banco; este
// wrapper não adiciona nem poderia remover essa proteção.
export async function getMetaIntegrationSettings(): Promise<MetaIntegrationSettings> {
  await getTenantContext();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_meta_integration_settings");
  if (error) {
    throw mapQarvonError(error, "Falha ao consultar configuração da Meta.");
  }
  const row = data?.[0];
  if (!row) {
    throw new AppError(
      "DATABASE_ERROR",
      "Falha ao consultar configuração da Meta.",
    );
  }
  return {
    pixelId: row.pixel_id,
    conversionValueMode: row.conversion_value_mode,
    active: row.active,
    hasAccessToken: row.has_access_token,
  };
}

export interface ConversionEventSummary {
  id: string;
  dealId: string;
  eventName: string;
  status: "PENDING" | "SENT" | "FAILED";
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
  leadName: string | null;
}

// Últimas conversões da organização (qualquer status) — usado pela tela de
// Integrações para mostrar o que já foi enviado/falhou/está pendente, e
// permitir reenviar uma falha. Volume naturalmente pequeno (1 linha por
// negócio fechado), sem necessidade de paginação nesta entrega.
export async function listRecentConversionEvents(
  limit = 20,
): Promise<ConversionEventSummary[]> {
  const { organizationId } = await getTenantContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("conversion_events")
    .select("id, deal_id, event_name, status, attempts, last_error, sent_at, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new AppError(
      "DATABASE_ERROR",
      "Falha ao consultar conversões enviadas.",
      error,
    );
  }
  if (data.length === 0) return [];

  const dealIds = data.map((event) => event.deal_id);
  const { data: deals, error: dealsError } = await supabase
    .from("deals")
    .select("id, lead_id")
    .eq("organization_id", organizationId)
    .in("id", dealIds);
  if (dealsError) {
    throw new AppError(
      "DATABASE_ERROR",
      "Falha ao consultar negócios das conversões.",
      dealsError,
    );
  }

  const leadIdByDealId = new Map(deals.map((deal) => [deal.id, deal.lead_id]));
  const leadIds = [...new Set(deals.map((deal) => deal.lead_id))];
  const { data: leads, error: leadsError } = leadIds.length
    ? await supabase
        .from("leads")
        .select("id, name")
        .eq("organization_id", organizationId)
        .in("id", leadIds)
    : { data: [] as { id: string; name: string }[], error: null };
  if (leadsError) {
    throw new AppError(
      "DATABASE_ERROR",
      "Falha ao consultar leads das conversões.",
      leadsError,
    );
  }
  const leadNameById = new Map(leads.map((lead) => [lead.id, lead.name]));

  return data.map((event) => {
    const leadId = leadIdByDealId.get(event.deal_id);
    return {
      id: event.id,
      dealId: event.deal_id,
      eventName: event.event_name,
      status: event.status,
      attempts: event.attempts,
      lastError: event.last_error,
      sentAt: event.sent_at,
      createdAt: event.created_at,
      leadName: leadId ? (leadNameById.get(leadId) ?? null) : null,
    };
  });
}
