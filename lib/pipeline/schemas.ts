import { z } from "zod";

export const createStageSchema = z.object({
  pipelineId: z.string().uuid(),
  name: z.string().trim().min(1, "Nome é obrigatório").max(80),
});
export type CreateStageInput = z.infer<typeof createStageSchema>;

export const updateStageSchema = z.object({
  stageId: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional().nullable(),
  active: z.boolean().optional().nullable(),
});
export type UpdateStageInput = z.infer<typeof updateStageSchema>;

export const reorderStagesSchema = z.object({
  pipelineId: z.string().uuid(),
  stageIds: z.array(z.string().uuid()).min(1),
});
export type ReorderStagesInput = z.infer<typeof reorderStagesSchema>;

export const deleteStageSchema = z.object({
  stageId: z.string().uuid(),
  reassignToStageId: z.string().uuid().optional().nullable(),
});
export type DeleteStageInput = z.infer<typeof deleteStageSchema>;

export const moveLeadSchema = z.object({
  leadId: z.string().uuid(),
  targetStageId: z.string().uuid(),
});
export type MoveLeadInput = z.infer<typeof moveLeadSchema>;

// Pelo menos um dos dois precisa vir preenchido — mesma regra do banco
// (deals_mrr_or_tcv_present), revalidada aqui para dar erro de campo em
// vez de estourar direto na RPC.
export const closeLeadWonSchema = z
  .object({
    leadId: z.string().uuid(),
    targetStageId: z.string().uuid(),
    mrr: z.number().finite().nonnegative().optional().nullable(),
    tcv: z.number().finite().nonnegative().optional().nullable(),
    note: z.string().trim().min(1).max(2000).optional().nullable(),
  })
  .refine((value) => value.mrr != null || value.tcv != null, {
    message: "Informe pelo menos MRR ou TCV.",
    path: ["mrr"],
  });
export type CloseLeadWonInput = z.infer<typeof closeLeadWonSchema>;

export const closeLeadLostSchema = z.object({
  leadId: z.string().uuid(),
  targetStageId: z.string().uuid(),
  lostReasonId: z.string().uuid().optional().nullable(),
  lostNote: z.string().trim().min(1).max(2000).optional().nullable(),
});
export type CloseLeadLostInput = z.infer<typeof closeLeadLostSchema>;
