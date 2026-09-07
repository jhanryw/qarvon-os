import { describe, expect, it } from "vitest";
import {
  createStageSchema,
  updateStageSchema,
  reorderStagesSchema,
  deleteStageSchema,
  moveLeadSchema,
  closeLeadWonSchema,
  closeLeadLostSchema,
} from "@/lib/pipeline/schemas";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("createStageSchema", () => {
  it("aceita pipelineId + name válidos", () => {
    expect(createStageSchema.safeParse({ pipelineId: UUID_A, name: "Proposta" }).success).toBe(true);
  });
  it("rejeita name vazio", () => {
    expect(createStageSchema.safeParse({ pipelineId: UUID_A, name: "   " }).success).toBe(false);
  });
});

describe("updateStageSchema", () => {
  it("aceita atualização só de active, sem name", () => {
    expect(updateStageSchema.safeParse({ stageId: UUID_A, active: false }).success).toBe(true);
  });
});

describe("reorderStagesSchema", () => {
  it("rejeita lista vazia", () => {
    expect(reorderStagesSchema.safeParse({ pipelineId: UUID_A, stageIds: [] }).success).toBe(false);
  });
  it("aceita uma lista de uuids", () => {
    expect(
      reorderStagesSchema.safeParse({ pipelineId: UUID_A, stageIds: [UUID_A, UUID_B] }).success,
    ).toBe(true);
  });
});

describe("deleteStageSchema", () => {
  it("aceita sem reassignToStageId (stage sem leads)", () => {
    expect(deleteStageSchema.safeParse({ stageId: UUID_A }).success).toBe(true);
  });
  it("aceita com reassignToStageId", () => {
    expect(
      deleteStageSchema.safeParse({ stageId: UUID_A, reassignToStageId: UUID_B }).success,
    ).toBe(true);
  });
});

describe("moveLeadSchema", () => {
  it("rejeita leadId que não é uuid", () => {
    expect(moveLeadSchema.safeParse({ leadId: "not-a-uuid", targetStageId: UUID_B }).success).toBe(
      false,
    );
  });
});

describe("closeLeadWonSchema", () => {
  it("aceita só MRR informado", () => {
    const result = closeLeadWonSchema.safeParse({ leadId: UUID_A, targetStageId: UUID_B, mrr: 2500 });
    expect(result.success).toBe(true);
  });
  it("aceita só TCV informado", () => {
    const result = closeLeadWonSchema.safeParse({ leadId: UUID_A, targetStageId: UUID_B, tcv: 15000 });
    expect(result.success).toBe(true);
  });
  it("aceita os dois informados", () => {
    const result = closeLeadWonSchema.safeParse({
      leadId: UUID_A,
      targetStageId: UUID_B,
      mrr: 2500,
      tcv: 15000,
    });
    expect(result.success).toBe(true);
  });
  it("rejeita quando nem MRR nem TCV são informados", () => {
    const result = closeLeadWonSchema.safeParse({ leadId: UUID_A, targetStageId: UUID_B });
    expect(result.success).toBe(false);
  });
  it("rejeita MRR negativo", () => {
    const result = closeLeadWonSchema.safeParse({ leadId: UUID_A, targetStageId: UUID_B, mrr: -1 });
    expect(result.success).toBe(false);
  });
});

describe("closeLeadLostSchema", () => {
  it("aceita sem motivo (motivo é recomendado pela UI, não obrigatório no schema)", () => {
    const result = closeLeadLostSchema.safeParse({ leadId: UUID_A, targetStageId: UUID_B });
    expect(result.success).toBe(true);
  });
  it("aceita com motivo e nota", () => {
    const result = closeLeadLostSchema.safeParse({
      leadId: UUID_A,
      targetStageId: UUID_B,
      lostReasonId: UUID_B,
      lostNote: "Cliente escolheu outro fornecedor",
    });
    expect(result.success).toBe(true);
  });
});
