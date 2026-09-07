import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { AppError } from "@/lib/errors";
import type { Tables } from "@/types/database";

export type Pipeline = Tables<"pipelines">;
export type PipelineStage = Tables<"pipeline_stages">;
export type LostReason = Tables<"lost_reasons">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function resolveNames(
  supabase: SupabaseServerClient,
  organizationId: string,
  table: "profiles" | "lead_sources" | "lost_reasons",
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from(table)
    .select("id, name")
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) {
    throw new AppError("DATABASE_ERROR", `Falha ao consultar ${table}.`, error);
  }
  return new Map(data.map((row) => [row.id, row.name]));
}

// Resolve o pipeline default ativo da organização — mesmo critério que
// _create_lead_with_pipeline_core já usa no banco (is_default and active),
// nunca um pipeline "qualquer". Ausência é um estado real e esperado
// (organização recém-criada sem seed rodado), não um erro de banco.
export async function getDefaultPipeline(): Promise<Pipeline> {
  const { organizationId } = await getTenantContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pipelines")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_default", true)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new AppError("DATABASE_ERROR", "Falha ao consultar pipeline.", error);
  }
  if (!data) {
    throw new AppError(
      "NO_DEFAULT_PIPELINE",
      "Nenhum pipeline padrão configurado para esta organização.",
    );
  }
  return data;
}

export interface PipelineStageWithFlags extends PipelineStage {
  // "Lead Novo" derivado (a OPEN de menor position) — nunca uma coluna
  // própria, ver migration 20260907100100. Usado pela UI de Configurações
  // para desenhar as travas de proteção sem duplicar a regra em SQL e TS.
  isLeadNovo: boolean;
  leadCount: number;
}

// Todas as stages do pipeline (inclusive inativas) — usado pela tela de
// Configurações, que precisa mostrar/reativar stages desativadas e exibir
// quantos leads cada uma tem ANTES de oferecer exclusão (item explícito do
// requisito). O Kanban usa getPipelineBoard() abaixo, que já filtra active
// e calcula agregados diferentes (soma de valor, não só contagem).
//
// Contagem via uma única query (stage_id de todos os leads do pipeline,
// reduzida em memória) — nunca uma query de count por stage.
export async function listPipelineStages(
  pipelineId: string,
): Promise<PipelineStageWithFlags[]> {
  const { organizationId } = await getTenantContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: true });

  if (error) {
    throw new AppError("DATABASE_ERROR", "Falha ao consultar estágios.", error);
  }

  const { data: leadStages, error: leadsError } = await supabase
    .from("leads")
    .select("stage_id")
    .eq("organization_id", organizationId)
    .eq("pipeline_id", pipelineId);
  if (leadsError) {
    throw new AppError("DATABASE_ERROR", "Falha ao contar leads por estágio.", leadsError);
  }

  const leadCountByStageId = new Map<string, number>();
  for (const lead of leadStages) {
    if (!lead.stage_id) continue;
    leadCountByStageId.set(lead.stage_id, (leadCountByStageId.get(lead.stage_id) ?? 0) + 1);
  }

  const minOpenStageId = data
    .filter((stage) => stage.stage_type === "OPEN")
    .sort((a, b) => a.position - b.position)[0]?.id;

  return data.map((stage) => ({
    ...stage,
    isLeadNovo: stage.id === minOpenStageId,
    leadCount: leadCountByStageId.get(stage.id) ?? 0,
  }));
}

export async function countLeadsInStage(stageId: string): Promise<number> {
  const { organizationId } = await getTenantContext();
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("stage_id", stageId);

  if (error) {
    throw new AppError(
      "DATABASE_ERROR",
      "Falha ao contar leads do estágio.",
      error,
    );
  }
  return count ?? 0;
}

export async function listLostReasons(
  options: { includeInactive?: boolean } = {},
): Promise<LostReason[]> {
  const { organizationId } = await getTenantContext();
  const supabase = await createClient();

  let query = supabase
    .from("lost_reasons")
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
      "Falha ao consultar motivos de perda.",
      error,
    );
  }
  return data;
}

export interface PipelineBoardCard {
  id: string;
  name: string;
  company: string | null;
  whatsapp: string | null;
  revenueRange: string | null;
  investsPaidTraffic: boolean | null;
  estimatedValue: number | null;
  createdAt: string;
  leadSourceName: string | null;
  ownerName: string | null;
  stageId: string;
  dealMrr: number | null;
  dealTcv: number | null;
  lostReasonName: string | null;
}

// Só isLeadNovo, sem leadCount: no board a contagem/soma vivem na COLUNA
// (agregadas a partir dos cards realmente carregados), não na stage —
// diferente de PipelineStageWithFlags (usado nas Configurações), que
// precisa do total histórico da stage mesmo antes de qualquer card ter
// sido carregado nesta tela.
export interface PipelineBoardStage extends PipelineStage {
  isLeadNovo: boolean;
}

export interface PipelineBoardColumn {
  stage: PipelineBoardStage;
  leadCount: number;
  totalValue: number;
  cards: PipelineBoardCard[];
}

export interface PipelineBoard {
  pipelineId: string;
  columns: PipelineBoardColumn[];
}

// Carrega o board inteiro em poucas consultas (nunca uma por coluna):
// 1 pipeline + 1 stages + 1 leads (todas as colunas de uma vez) + no
// máximo 4 lookups em lote (deals/lost_reasons/profiles/lead_sources,
// cada um só com os ids realmente presentes nos leads carregados). Não
// carrega lead_stage_history — a idade do card vem de leads.created_at.
//
// Limite conhecido: sem paginação por coluna ainda — adequado para
// centenas de leads; volumes muito maiores (dezenas de milhares) exigiriam
// uma agregação dedicada (view/RPC) e paginação por stage, não
// implementado nesta entrega.
export async function getPipelineBoard(): Promise<PipelineBoard> {
  const { organizationId } = await getTenantContext();
  const supabase = await createClient();

  const pipeline = await getDefaultPipeline();

  const { data: stages, error: stagesError } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("pipeline_id", pipeline.id)
    .eq("active", true)
    .order("position", { ascending: true });
  if (stagesError) {
    throw new AppError("DATABASE_ERROR", "Falha ao consultar estágios.", stagesError);
  }

  const minOpenStageId = stages
    .filter((stage) => stage.stage_type === "OPEN")
    .sort((a, b) => a.position - b.position)[0]?.id;

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select(
      "id, name, company, whatsapp, revenue_range, invests_paid_traffic, estimated_value, created_at, stage_id, owner_id, lead_source_id, lost_reason_id",
    )
    .eq("organization_id", organizationId)
    .eq("pipeline_id", pipeline.id)
    .order("created_at", { ascending: false });
  if (leadsError) {
    throw new AppError(
      "DATABASE_ERROR",
      "Falha ao consultar leads do pipeline.",
      leadsError,
    );
  }

  const stageTypeById = new Map(stages.map((stage) => [stage.id, stage.stage_type]));
  const wonLeadIds = leads
    .filter((lead) => lead.stage_id && stageTypeById.get(lead.stage_id) === "WON")
    .map((lead) => lead.id);
  const lostReasonIds = [
    ...new Set(leads.map((lead) => lead.lost_reason_id).filter((id): id is string => id != null)),
  ];
  const ownerIds = [
    ...new Set(leads.map((lead) => lead.owner_id).filter((id): id is string => id != null)),
  ];
  const sourceIds = [
    ...new Set(leads.map((lead) => lead.lead_source_id).filter((id): id is string => id != null)),
  ];

  const [dealsResult, lostReasonNames, ownerNames, sourceNames] = await Promise.all([
    wonLeadIds.length
      ? supabase
          .from("deals")
          .select("lead_id, mrr, tcv")
          .eq("organization_id", organizationId)
          .in("lead_id", wonLeadIds)
      : Promise.resolve({ data: [] as { lead_id: string; mrr: number | null; tcv: number | null }[], error: null }),
    resolveNames(supabase, organizationId, "lost_reasons", lostReasonIds),
    resolveNames(supabase, organizationId, "profiles", ownerIds),
    resolveNames(supabase, organizationId, "lead_sources", sourceIds),
  ]);
  if (dealsResult.error) {
    throw new AppError("DATABASE_ERROR", "Falha ao consultar negócios fechados.", dealsResult.error);
  }

  const dealByLeadId = new Map(dealsResult.data.map((deal) => [deal.lead_id, deal]));

  const columns: PipelineBoardColumn[] = stages.map((stage) => {
    const stageLeads = leads.filter((lead) => lead.stage_id === stage.id);

    const cards: PipelineBoardCard[] = stageLeads.map((lead) => {
      const deal = dealByLeadId.get(lead.id);
      return {
        id: lead.id,
        name: lead.name,
        company: lead.company,
        whatsapp: lead.whatsapp,
        revenueRange: lead.revenue_range,
        investsPaidTraffic: lead.invests_paid_traffic,
        estimatedValue: lead.estimated_value,
        createdAt: lead.created_at,
        leadSourceName: lead.lead_source_id
          ? (sourceNames.get(lead.lead_source_id) ?? null)
          : null,
        ownerName: lead.owner_id ? (ownerNames.get(lead.owner_id) ?? null) : null,
        stageId: stage.id,
        dealMrr: deal?.mrr ?? null,
        dealTcv: deal?.tcv ?? null,
        lostReasonName: lead.lost_reason_id
          ? (lostReasonNames.get(lead.lost_reason_id) ?? null)
          : null,
      };
    });

    let totalValue: number;
    if (stage.stage_type === "WON") {
      totalValue = stageLeads.reduce((sum, lead) => {
        const deal = dealByLeadId.get(lead.id);
        return sum + (deal?.tcv ?? deal?.mrr ?? 0);
      }, 0);
    } else {
      // OPEN: soma das negociações em aberto. LOST: soma do que estava em
      // negociação antes da perda (leads.estimated_value atual — não é um
      // snapshot histórico, ver nota na migration de lost_reasons).
      totalValue = stageLeads.reduce((sum, lead) => sum + (lead.estimated_value ?? 0), 0);
    }

    return {
      stage: { ...stage, isLeadNovo: stage.id === minOpenStageId },
      leadCount: stageLeads.length,
      totalValue,
      cards,
    };
  });

  return { pipelineId: pipeline.id, columns };
}
