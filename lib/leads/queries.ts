import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { AppError } from "@/lib/errors";
import { listLeadsSchema, type ListLeadsInput } from "@/lib/leads/schemas";
import { computeNextActionRange } from "@/lib/leads/date-range";
import type { Tables } from "@/types/database";

export type Lead = Tables<"leads">;
export type LeadSource = Tables<"lead_sources">;

// page/pageSize (1-indexado) -> range 0-indexado para .range() do PostgREST.
export function computePageRange(
  page: number,
  pageSize: number,
): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

// Escapa "%" e "_" (curingas do ILIKE) no termo digitado pelo usuário, para
// que uma busca por "50%" não seja interpretada como padrão de wildcard.
export function escapeIlikeTerm(term: string): string {
  return term.replace(/[%_]/g, (match) => `\\${match}`);
}

export interface ListLeadSourcesOptions {
  includeInactive?: boolean;
}

// Lista as origens da organização atual. Por padrão só as ativas — uma
// source inativa não deve ser oferecida para escolha em um lead novo, mas
// pode ser necessária ao editar um lead que já a referencia (includeInactive).
export async function listLeadSources(
  options: ListLeadSourcesOptions = {},
): Promise<LeadSource[]> {
  const { organizationId } = await getTenantContext();
  const supabase = await createClient();

  let query = supabase
    .from("lead_sources")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (!options.includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new AppError(
      "DATABASE_ERROR",
      "Falha ao consultar origens de lead.",
      error,
    );
  }
  return data;
}

export interface LeadListItem extends Lead {
  ownerName: string | null;
  leadSourceName: string | null;
}

export interface ListLeadsResult {
  leads: LeadListItem[];
  page: number;
  pageSize: number;
  total: number;
}

// Resolve nomes de owner/lead_source para um conjunto de leads em no
// máximo 2 queries extras (uma por tabela, com .in()) — nunca uma consulta
// por linha. organization_id como defesa extra, mesmo a FK composta já
// garantindo que só há ids da própria organização aqui.
async function resolveNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  table: "profiles" | "lead_sources",
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from(table)
    .select("id, name")
    .eq("organization_id", organizationId)
    .in("id", ids);

  if (error) {
    throw new AppError(
      "DATABASE_ERROR",
      `Falha ao consultar ${table === "profiles" ? "responsáveis" : "origens"}.`,
      error,
    );
  }
  return new Map(data.map((row) => [row.id, row.name]));
}

// Consulta preparada para a listagem. Organização sempre do contexto do
// servidor; busca cobre name/company/whatsapp via ILIKE — aceitável no
// volume atual (ver nota de escala no README de leads).
export async function listLeads(
  input: ListLeadsInput = {},
): Promise<ListLeadsResult> {
  const parsed = listLeadsSchema.parse(input);
  const { organizationId, organization } = await getTenantContext();
  const supabase = await createClient();

  const { from, to } = computePageRange(parsed.page, parsed.pageSize);

  let query = supabase
    .from("leads")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (parsed.search) {
    const term = `%${escapeIlikeTerm(parsed.search)}%`;
    query = query.or(
      `name.ilike.${term},company.ilike.${term},whatsapp.ilike.${term}`,
    );
  }
  if (parsed.ownerId === "none") {
    query = query.is("owner_id", null);
  } else if (parsed.ownerId) {
    query = query.eq("owner_id", parsed.ownerId);
  }
  if (parsed.leadSourceId === "none") {
    query = query.is("lead_source_id", null);
  } else if (parsed.leadSourceId) {
    query = query.eq("lead_source_id", parsed.leadSourceId);
  }
  if (parsed.temperature) {
    query = query.eq("temperature", parsed.temperature);
  }
  if (parsed.nextActionFilter) {
    const range = computeNextActionRange(
      parsed.nextActionFilter,
      organization.timezone,
    );
    if (range.isNull) {
      query = query.is("next_action_at", null);
    } else {
      if (range.gte) query = query.gte("next_action_at", range.gte);
      if (range.lt) query = query.lt("next_action_at", range.lt);
    }
  }
  if (parsed.minEstimatedValue != null) {
    query = query.gte("estimated_value", parsed.minEstimatedValue);
  }
  if (parsed.maxEstimatedValue != null) {
    query = query.lte("estimated_value", parsed.maxEstimatedValue);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new AppError("DATABASE_ERROR", "Falha ao consultar leads.", error);
  }

  const ownerIds = [
    ...new Set(
      data.map((lead) => lead.owner_id).filter((id): id is string => id !== null),
    ),
  ];
  const sourceIds = [
    ...new Set(
      data
        .map((lead) => lead.lead_source_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  const [ownerNames, sourceNames] = await Promise.all([
    resolveNames(supabase, organizationId, "profiles", ownerIds),
    resolveNames(supabase, organizationId, "lead_sources", sourceIds),
  ]);

  const leads: LeadListItem[] = data.map((lead) => ({
    ...lead,
    ownerName: lead.owner_id ? (ownerNames.get(lead.owner_id) ?? null) : null,
    leadSourceName: lead.lead_source_id
      ? (sourceNames.get(lead.lead_source_id) ?? null)
      : null,
  }));

  return {
    leads,
    page: parsed.page,
    pageSize: parsed.pageSize,
    total: count ?? 0,
  };
}

// Só aceita leadId — organização vem sempre do contexto do servidor. Um
// UUID de outro tenant se comporta exatamente como "não encontrado": nunca
// revela se o lead existe em outra organização.
export async function getLeadById(leadId: string): Promise<Lead> {
  if (!z.string().uuid().safeParse(leadId).success) {
    throw new AppError("NOT_FOUND", "Lead não encontrado.");
  }

  const { organizationId } = await getTenantContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new AppError("DATABASE_ERROR", "Falha ao consultar lead.", error);
  }
  if (!data) {
    throw new AppError("NOT_FOUND", "Lead não encontrado.");
  }
  return data;
}
