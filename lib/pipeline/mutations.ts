import { createClient } from "@/lib/supabase/server";
import { mapQarvonError } from "@/lib/errors";
import {
  createStageSchema,
  updateStageSchema,
  reorderStagesSchema,
  deleteStageSchema,
  moveLeadSchema,
  closeLeadWonSchema,
  closeLeadLostSchema,
} from "@/lib/pipeline/schemas";
import type { Lead } from "@/lib/leads/queries";
import type { PipelineStage } from "@/lib/pipeline/queries";

// Wrappers finos em torno das RPCs transacionais (M2.2C) — nenhuma lógica
// de negócio aqui, só validação de forma (Zod) + tradução de marcador
// QARVON_* para AppError. Toda regra real (locks, proteção de stage
// estrutural, histórico) vive no banco, nunca duplicada aqui.

export async function moveLeadToStage(input: unknown): Promise<Lead> {
  const parsed = moveLeadSchema.parse(input);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("move_lead_to_stage", {
    p_lead_id: parsed.leadId,
    p_target_stage_id: parsed.targetStageId,
  });

  if (error) throw mapQarvonError(error, "Falha ao mover lead.");
  return data;
}

export async function createPipelineStage(input: unknown): Promise<PipelineStage> {
  const parsed = createStageSchema.parse(input);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_pipeline_stage", {
    p_pipeline_id: parsed.pipelineId,
    p_name: parsed.name,
  });

  if (error) throw mapQarvonError(error, "Falha ao criar etapa.");
  return data;
}

export async function updatePipelineStage(input: unknown): Promise<PipelineStage> {
  const parsed = updateStageSchema.parse(input);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("update_pipeline_stage", {
    p_stage_id: parsed.stageId,
    p_name: parsed.name ?? null,
    p_active: parsed.active ?? null,
  });

  if (error) throw mapQarvonError(error, "Falha ao atualizar etapa.");
  return data;
}

export async function reorderPipelineStages(input: unknown): Promise<void> {
  const parsed = reorderStagesSchema.parse(input);
  const supabase = await createClient();

  const { error } = await supabase.rpc("reorder_pipeline_stages", {
    p_pipeline_id: parsed.pipelineId,
    p_stage_ids: parsed.stageIds,
  });

  if (error) throw mapQarvonError(error, "Falha ao reordenar etapas.");
}

export async function deletePipelineStage(input: unknown): Promise<void> {
  const parsed = deleteStageSchema.parse(input);
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_pipeline_stage", {
    p_stage_id: parsed.stageId,
    p_reassign_to_stage_id: parsed.reassignToStageId ?? null,
  });

  if (error) throw mapQarvonError(error, "Falha ao excluir etapa.");
}

export interface CloseLeadWonResult {
  leadId: string;
  dealId: string;
}

export async function closeLeadWon(input: unknown): Promise<CloseLeadWonResult> {
  const parsed = closeLeadWonSchema.parse(input);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("close_lead_won", {
    p_lead_id: parsed.leadId,
    p_target_stage_id: parsed.targetStageId,
    p_mrr: parsed.mrr ?? null,
    p_tcv: parsed.tcv ?? null,
    p_note: parsed.note ?? null,
  });

  if (error) throw mapQarvonError(error, "Falha ao fechar negócio.");
  const row = data?.[0];
  if (!row) {
    throw mapQarvonError(
      { message: "close_lead_won não retornou nenhuma linha" },
      "Falha ao fechar negócio.",
    );
  }
  return { leadId: row.lead_id, dealId: row.deal_id };
}

export async function closeLeadLost(input: unknown): Promise<Lead> {
  const parsed = closeLeadLostSchema.parse(input);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("close_lead_lost", {
    p_lead_id: parsed.leadId,
    p_target_stage_id: parsed.targetStageId,
    p_lost_reason_id: parsed.lostReasonId ?? null,
    p_lost_note: parsed.lostNote ?? null,
  });

  if (error) throw mapQarvonError(error, "Falha ao marcar lead como perdido.");
  return data;
}
