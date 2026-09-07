import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { AppError, mapQarvonError } from "@/lib/errors";
import { createLeadSchema, updateLeadSchema } from "@/lib/leads/schemas";
import {
  normalizeEmail,
  normalizeEstimatedValue,
  normalizeInstagram,
  normalizeNextActionAt,
  normalizeWebsite,
  normalizeWhatsapp,
} from "@/lib/leads/normalize";
import type { Lead } from "@/lib/leads/queries";
import type { TablesUpdate } from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function assertOwnerBelongsToOrganization(
  supabase: SupabaseServerClient,
  organizationId: string,
  ownerId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", ownerId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new AppError(
      "DATABASE_ERROR",
      "Falha ao validar responsável.",
      error,
    );
  }
  if (!data) {
    throw new AppError(
      "INVALID_OWNER",
      "Responsável inválido para esta organização.",
    );
  }
}

// requireActive: novos leads não podem escolher uma source inativa; leads
// que já referenciam uma source desativada continuam válidos ao editar
// outros campos (não passamos leadSourceId de novo nesse caso).
async function assertLeadSourceUsable(
  supabase: SupabaseServerClient,
  organizationId: string,
  leadSourceId: string,
) {
  const { data, error } = await supabase
    .from("lead_sources")
    .select("id, active")
    .eq("id", leadSourceId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new AppError(
      "DATABASE_ERROR",
      "Falha ao validar origem do lead.",
      error,
    );
  }
  if (!data) {
    throw new AppError(
      "INVALID_LEAD_SOURCE",
      "Origem inválida para esta organização.",
    );
  }
  if (!data.active) {
    throw new AppError(
      "INVALID_LEAD_SOURCE",
      "Esta origem está inativa e não pode ser usada em novos leads.",
    );
  }
}

async function assertWhatsappNotDuplicated(
  supabase: SupabaseServerClient,
  organizationId: string,
  whatsapp: string,
  excludeLeadId?: string,
) {
  let query = supabase
    .from("leads")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("whatsapp", whatsapp)
    .limit(1);

  if (excludeLeadId) {
    query = query.neq("id", excludeLeadId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new AppError(
      "DATABASE_ERROR",
      "Falha ao verificar duplicidade de WhatsApp.",
      error,
    );
  }
  if (data) {
    throw new AppError(
      "DUPLICATE_WHATSAPP",
      "Já existe um lead com este WhatsApp nesta organização.",
    );
  }
}

// FK composta é a última defesa no banco; se as validações acima já
// rodaram, uma violação aqui não deveria acontecer — mas se acontecer
// (race condition), não expomos o erro SQL cru.
function mapInsertError(error: { code?: string; message: string }): AppError {
  if (error.code === "23503") {
    return new AppError(
      "VALIDATION_ERROR",
      "Responsável ou origem inválidos para esta organização.",
      error,
    );
  }
  return new AppError("DATABASE_ERROR", "Falha ao salvar lead.", error);
}

// Cria o lead via create_lead_with_pipeline (RPC transacional, M2.2A) em
// vez de INSERT direto: fecha uma lacuna real entre o que o banco já
// resolve (pipeline default + primeira stage OPEN + evento de bootstrap em
// lead_stage_history) e o que o caminho humano usava até aqui — leads
// criados pelo formulário do CRM ficavam com pipeline_id/stage_id NULL,
// impossíveis de aparecer no Kanban. A RPC também revalida owner/source/
// duplicidade de WhatsApp internamente (mesmas regras de negócio, agora
// como fronteira de segurança de verdade, não só neste arquivo).
//
// getTenantContext() continua chamado (mesmo sem usar organizationId no
// payload — a RPC resolve isso sozinha via auth.uid()): é o único ponto
// que distingue "sem sessão" (UNAUTHENTICATED -> /login) de "sessão sem
// profile válido" (NO_ACCESS -> /sem-acesso); sem ele, os dois casos
// colapsariam no mesmo QARVON_NO_ACCESS genérico da RPC.
export async function createLead(input: unknown): Promise<Lead> {
  const parsed = createLeadSchema.parse(input);
  await getTenantContext();
  const supabase = await createClient();

  const whatsapp = parsed.whatsapp
    ? normalizeWhatsapp(parsed.whatsapp)
    : null;

  const payload = {
    name: parsed.name,
    whatsapp,
    company: parsed.company ?? null,
    lead_source_id: parsed.leadSourceId ?? null,
    owner_id: parsed.ownerId ?? null,
    note: parsed.note ?? null,
    email: parsed.email ? normalizeEmail(parsed.email) : null,
    instagram: parsed.instagram ? normalizeInstagram(parsed.instagram) : null,
    website: parsed.website ? normalizeWebsite(parsed.website) : null,
    segment: parsed.segment ?? null,
    city: parsed.city ?? null,
    state: parsed.state ?? null,
    service_interest: parsed.serviceInterest ?? null,
    estimated_value:
      parsed.estimatedValue != null
        ? normalizeEstimatedValue(parsed.estimatedValue)
        : null,
    campaign: parsed.campaign ?? null,
    revenue_range: parsed.revenueRange ?? null,
    temperature: parsed.temperature ?? null,
    next_action: parsed.nextAction ?? null,
    next_action_at: parsed.nextActionAt
      ? normalizeNextActionAt(parsed.nextActionAt)
      : null,
  };

  const { data, error } = await supabase.rpc("create_lead_with_pipeline", {
    p_lead: payload,
  });

  if (error) {
    throw mapQarvonError(error, "Falha ao salvar lead.");
  }
  return data;
}

export async function updateLead(
  leadId: string,
  input: unknown,
): Promise<Lead> {
  const parsed = updateLeadSchema.parse(input);
  const { organizationId } = await getTenantContext();
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (existingError) {
    throw new AppError(
      "DATABASE_ERROR",
      "Falha ao consultar lead.",
      existingError,
    );
  }
  if (!existing) {
    throw new AppError("NOT_FOUND", "Lead não encontrado.");
  }

  if (parsed.ownerId !== undefined && parsed.ownerId !== null) {
    await assertOwnerBelongsToOrganization(supabase, organizationId, parsed.ownerId);
  }
  // Só valida "usável" (inclusive active) quando o lead_source está sendo
  // escolhido agora — não reavalia uma source já vinculada que não mudou.
  if (parsed.leadSourceId !== undefined && parsed.leadSourceId !== null) {
    await assertLeadSourceUsable(supabase, organizationId, parsed.leadSourceId);
  }

  const whatsapp =
    parsed.whatsapp !== undefined
      ? parsed.whatsapp
        ? normalizeWhatsapp(parsed.whatsapp)
        : null
      : undefined;

  if (whatsapp) {
    await assertWhatsappNotDuplicated(
      supabase,
      organizationId,
      whatsapp,
      leadId,
    );
  }

  const payload: TablesUpdate<"leads"> = {};
  if (parsed.name !== undefined) payload.name = parsed.name;
  if (whatsapp !== undefined) payload.whatsapp = whatsapp;
  if (parsed.company !== undefined) payload.company = parsed.company;
  if (parsed.leadSourceId !== undefined)
    payload.lead_source_id = parsed.leadSourceId;
  if (parsed.ownerId !== undefined) payload.owner_id = parsed.ownerId;
  if (parsed.note !== undefined) payload.note = parsed.note;
  if (parsed.email !== undefined)
    payload.email = parsed.email ? normalizeEmail(parsed.email) : null;
  if (parsed.instagram !== undefined)
    payload.instagram = parsed.instagram
      ? normalizeInstagram(parsed.instagram)
      : null;
  if (parsed.website !== undefined)
    payload.website = parsed.website ? normalizeWebsite(parsed.website) : null;
  if (parsed.segment !== undefined) payload.segment = parsed.segment;
  if (parsed.city !== undefined) payload.city = parsed.city;
  if (parsed.state !== undefined) payload.state = parsed.state;
  if (parsed.serviceInterest !== undefined)
    payload.service_interest = parsed.serviceInterest;
  if (parsed.estimatedValue !== undefined)
    payload.estimated_value =
      parsed.estimatedValue != null
        ? normalizeEstimatedValue(parsed.estimatedValue)
        : null;
  if (parsed.campaign !== undefined) payload.campaign = parsed.campaign;
  if (parsed.revenueRange !== undefined)
    payload.revenue_range = parsed.revenueRange;
  if (parsed.temperature !== undefined) payload.temperature = parsed.temperature;
  if (parsed.nextAction !== undefined) payload.next_action = parsed.nextAction;
  if (parsed.nextActionAt !== undefined)
    payload.next_action_at = parsed.nextActionAt
      ? normalizeNextActionAt(parsed.nextActionAt)
      : null;

  // maybeSingle() em vez de single(): single() só detecta "0 linhas" se o
  // PostgREST devolver o 406 esperado — sem checagem no lado do cliente.
  // maybeSingle() converte array vazio em null de forma confiável
  // independente da resposta do servidor, então conseguimos checar
  // explicitamente abaixo em vez de arriscar tratar 0 linhas como sucesso.
  const { data, error } = await supabase
    .from("leads")
    .update(payload)
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw mapInsertError(error);
  }
  if (!data) {
    // A checagem de existência acima, segundos antes, usou o mesmo filtro
    // id+organization_id e encontrou a linha — se o UPDATE não retornou
    // nada agora, é um estado inesperado, não "não encontrado" normal.
    throw new AppError(
      "DATABASE_ERROR",
      "Falha ao salvar lead: nenhuma linha foi atualizada.",
    );
  }
  return data;
}
