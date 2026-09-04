import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { AppError } from "@/lib/errors";
import { listLeadsSchema, type ListLeadsInput } from "@/lib/leads/schemas";
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

export interface ListLeadsResult {
  leads: Lead[];
  page: number;
  pageSize: number;
  total: number;
}

// Consulta preparada para a listagem (UI vem no M1.4). Organização sempre
// do contexto do servidor; busca cobre name/company/whatsapp via ILIKE —
// aceitável no volume atual (ver nota de escala no README de leads).
export async function listLeads(
  input: ListLeadsInput = {},
): Promise<ListLeadsResult> {
  const parsed = listLeadsSchema.parse(input);
  const { organizationId } = await getTenantContext();
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
  if (parsed.ownerId) {
    query = query.eq("owner_id", parsed.ownerId);
  }
  if (parsed.leadSourceId) {
    query = query.eq("lead_source_id", parsed.leadSourceId);
  }
  if (parsed.temperature) {
    query = query.eq("temperature", parsed.temperature);
  }
  if (parsed.hasPendingNextAction) {
    query = query.not("next_action_at", "is", null);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new AppError("DATABASE_ERROR", "Falha ao consultar leads.", error);
  }

  return {
    leads: data,
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
