import { describe, expect, it, vi, beforeEach } from "vitest";
import { AppError } from "@/lib/errors";

const { getTenantContext } = vi.hoisted(() => ({ getTenantContext: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getTenantContext }));

const {
  moveLeadToStage,
  createPipelineStage,
  updatePipelineStage,
  reorderPipelineStages,
  deletePipelineStage,
  closeLeadWon,
  closeLeadLost,
} = vi.hoisted(() => ({
  moveLeadToStage: vi.fn(),
  createPipelineStage: vi.fn(),
  updatePipelineStage: vi.fn(),
  reorderPipelineStages: vi.fn(),
  deletePipelineStage: vi.fn(),
  closeLeadWon: vi.fn(),
  closeLeadLost: vi.fn(),
}));
vi.mock("@/lib/pipeline/mutations", () => ({
  moveLeadToStage,
  createPipelineStage,
  updatePipelineStage,
  reorderPipelineStages,
  deletePipelineStage,
  closeLeadWon,
  closeLeadLost,
}));

const { countLeadsInStage } = vi.hoisted(() => ({ countLeadsInStage: vi.fn() }));
vi.mock("@/lib/pipeline/queries", () => ({ countLeadsInStage }));

const { dispatchWonConversion } = vi.hoisted(() => ({ dispatchWonConversion: vi.fn() }));
vi.mock("@/lib/integrations/meta/dispatch", () => ({ dispatchWonConversion }));

const {
  moveLeadAction,
  closeLeadWonAction,
  closeLeadLostAction,
  createPipelineStageAction,
  deletePipelineStageAction,
  checkStageLeadCountAction,
} = await import("@/lib/pipeline/actions");

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  getTenantContext.mockResolvedValue({ organizationId: "org-1" });
});

describe("moveLeadAction", () => {
  it("retorna success quando a mutation resolve", async () => {
    moveLeadToStage.mockResolvedValue({ id: UUID_A });
    const result = await moveLeadAction({ leadId: UUID_A, targetStageId: UUID_B });
    expect(result).toEqual({ success: true });
  });

  it("mapeia STAGE_PROTECTED para uma mensagem amigável, sem lançar", async () => {
    moveLeadToStage.mockRejectedValue(new AppError("STAGE_PROTECTED", "x"));
    const result = await moveLeadAction({ leadId: UUID_A, targetStageId: UUID_B });
    expect(result.success).toBe(false);
    expect(result.code).toBe("STAGE_PROTECTED");
    expect(result.message).toBeTruthy();
  });

  it("nunca propaga o AppError como exceção cruzando a fronteira server action -> client", async () => {
    moveLeadToStage.mockRejectedValue(new Error("erro cru de banco"));
    await expect(moveLeadAction({ leadId: UUID_A, targetStageId: UUID_B })).resolves.toMatchObject({
      success: false,
    });
  });
});

describe("closeLeadWonAction", () => {
  it("fecha o negócio e dispara a conversão Meta em sequência, na ordem correta", async () => {
    closeLeadWon.mockResolvedValue({ leadId: UUID_A, dealId: UUID_B });
    dispatchWonConversion.mockResolvedValue(undefined);

    const result = await closeLeadWonAction({ leadId: UUID_A, targetStageId: UUID_B, mrr: 2500 });

    expect(result).toEqual({ success: true });
    // closeLeadWon precisa ter sido chamado ANTES do dispatch Meta (o
    // fechamento já precisa estar commitado antes de qualquer tentativa de
    // notificar a Meta) — comparado pela ordem global de invocação dos
    // mocks, sem depender de um matcher externo (jest-extended não está
    // instalado neste projeto).
    expect(closeLeadWon.mock.invocationCallOrder[0]).toBeLessThan(
      dispatchWonConversion.mock.invocationCallOrder[0],
    );
    expect(dispatchWonConversion).toHaveBeenCalledWith({ organizationId: "org-1", dealId: UUID_B });
  });

  it("falha do dispatch Meta NUNCA desfaz o fechamento nem propaga como erro da action", async () => {
    closeLeadWon.mockResolvedValue({ leadId: UUID_A, dealId: UUID_B });
    dispatchWonConversion.mockRejectedValue(new Error("Meta indisponível"));

    const result = await closeLeadWonAction({ leadId: UUID_A, targetStageId: UUID_B, mrr: 2500 });
    expect(result).toEqual({ success: true });
  });

  it("se close_lead_won falhar, a Meta nunca é chamada", async () => {
    closeLeadWon.mockRejectedValue(new AppError("DEAL_VALUE_REQUIRED", "x"));

    const result = await closeLeadWonAction({ leadId: UUID_A, targetStageId: UUID_B });
    expect(result.success).toBe(false);
    expect(dispatchWonConversion).not.toHaveBeenCalled();
  });
});

describe("closeLeadLostAction", () => {
  it("retorna success quando a mutation resolve", async () => {
    closeLeadLost.mockResolvedValue({ id: UUID_A });
    const result = await closeLeadLostAction({ leadId: UUID_A, targetStageId: UUID_B });
    expect(result).toEqual({ success: true });
  });
});

describe("createPipelineStageAction / deletePipelineStageAction", () => {
  it("cria etapa com sucesso", async () => {
    createPipelineStage.mockResolvedValue({ id: UUID_A });
    const result = await createPipelineStageAction({ pipelineId: UUID_A, name: "Proposta" });
    expect(result).toEqual({ success: true });
  });

  it("mapeia REASSIGN_STAGE_REQUIRED para o client decidir abrir o seletor de destino", async () => {
    deletePipelineStage.mockRejectedValue(new AppError("REASSIGN_STAGE_REQUIRED", "x"));
    const result = await deletePipelineStageAction({ stageId: UUID_A });
    expect(result.success).toBe(false);
    expect(result.code).toBe("REASSIGN_STAGE_REQUIRED");
  });
});

describe("checkStageLeadCountAction", () => {
  it("retorna a contagem quando a consulta funciona", async () => {
    countLeadsInStage.mockResolvedValue(4);
    const result = await checkStageLeadCountAction(UUID_A);
    expect(result).toEqual({ leadCount: 4 });
  });

  it("retorna erro amigável em vez de lançar quando a consulta falha", async () => {
    countLeadsInStage.mockRejectedValue(new AppError("DATABASE_ERROR", "x"));
    const result = await checkStageLeadCountAction(UUID_A);
    expect("error" in result).toBe(true);
  });
});
