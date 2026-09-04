import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { AppError } from "@/lib/errors";
import {
  createLeadSchema,
  updateLeadSchema,
  type CreateLeadInput,
  type UpdateLeadInput,
} from "@/lib/leads/schemas";
import {
  normalizeEmail,
  normalizeEstimatedValue,
  normalizeInstagram,
  normalizeNextActionAt,
  normalizeWebsite,
  normalizeWhatsapp,
} from "@/lib/leads/normalize";
import type { Lead } from "@/lib/leads/queries";
import type { TablesInsert, TablesUpdate } from "@/types/database";

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

export async function createLead(input: CreateLeadInput): Promise<Lead> {
  const parsed = createLeadSchema.parse(input);
  const { organizationId } = await getTenantContext();
  const supabase = await createClient();

  const whatsapp = parsed.whatsapp
    ? normalizeWhatsapp(parsed.whatsapp)
    : null;

  if (parsed.ownerId) {
    await assertOwnerBelongsToOrganization(supabase, organizationId, parsed.ownerId);
  }
  if (parsed.leadSourceId) {
    await assertLeadSourceUsable(supabase, organizationId, parsed.leadSourceId);
  }
  if (whatsapp) {
    await assertWhatsappNotDuplicated(supabase, organizationId, whatsapp);
  }

  const payload: TablesInsert<"leads"> = {
    organization_id: organizationId,
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

  const { data, error } = await supabase
    .from("leads")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw mapInsertError(error);
  }
  return data;
}

export async function updateLead(
  leadId: string,
  input: UpdateLeadInput,
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

  const { data, error } = await supabase
    .from("leads")
    .update(payload)
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .select("*")
    .single();

  if (error) {
    throw mapInsertError(error);
  }
  return data;
}
