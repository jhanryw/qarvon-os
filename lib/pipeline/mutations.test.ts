import { describe, expect, it, vi, beforeEach } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const {
  moveLeadToStage,
  createPipelineStage,
  updatePipelineStage,
  reorderPipelineStages,
  deletePipelineStage,
  closeLeadWon,
  closeLeadLost,
} = await import("@/lib/pipeline/mutations");

function fakeSupabase(rpcResponse: { data: unknown; error: unknown }) {
  const calls: { fn: string; args: unknown }[] = [];
  const rpc = (fn: string, args: unknown) => {
    calls.push({ fn, args });
    return Promise.resolve(rpcResponse);
  };
  return { client: { rpc }, calls };
}

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  createClient.mockReset();
});

describe("moveLeadToStage", () => {
  it("chama move_lead_to_stage com os parâmetros corretos", async () => {
    const fake = fakeSupabase({ data: { id: UUID_A, stage_id: UUID_B }, error: null });
    createClient.mockResolvedValue(fake.client);

    const result = await moveLeadToStage({ leadId: UUID_A, targetStageId: UUID_B });
    expect(result).toEqual({ id: UUID_A, stage_id: UUID_B });
    expect(fake.calls[0]).toEqual({
      fn: "move_lead_to_stage",
      args: { p_lead_id: UUID_A, p_target_stage_id: UUID_B },
    });
  });

  it("mapeia QARVON_STAGE_PROTECTED para AppError com o código correto", async () => {
    const fake = fakeSupabase({ data: null, error: { message: "QARVON_STAGE_PROTECTED" } });
    createClient.mockResolvedValue(fake.client);

    await expect(moveLeadToStage({ leadId: UUID_A, targetStageId: UUID_B })).rejects.toMatchObject({
      code: "STAGE_PROTECTED",
    });
  });

  it("rejeita input inválido antes de chamar a RPC", async () => {
    await expect(moveLeadToStage({ leadId: "not-a-uuid", targetStageId: UUID_B })).rejects.toThrow();
  });
});

describe("createPipelineStage", () => {
  it("chama create_pipeline_stage com pipelineId/name mapeados", async () => {
    const fake = fakeSupabase({ data: { id: UUID_A, name: "Proposta" }, error: null });
    createClient.mockResolvedValue(fake.client);

    await createPipelineStage({ pipelineId: UUID_B, name: "Proposta" });
    expect(fake.calls[0]).toEqual({
      fn: "create_pipeline_stage",
      args: { p_pipeline_id: UUID_B, p_name: "Proposta" },
    });
  });
});

describe("updatePipelineStage", () => {
  it("mapeia QARVON_STAGE_PROTECTED ao tentar desativar uma stage estrutural", async () => {
    const fake = fakeSupabase({ data: null, error: { message: "QARVON_STAGE_PROTECTED" } });
    createClient.mockResolvedValue(fake.client);

    await expect(
      updatePipelineStage({ stageId: UUID_A, active: false }),
    ).rejects.toMatchObject({ code: "STAGE_PROTECTED" });
  });
});

describe("reorderPipelineStages", () => {
  it("chama reorder_pipeline_stages com a lista de ids", async () => {
    const fake = fakeSupabase({ data: null, error: null });
    createClient.mockResolvedValue(fake.client);

    await reorderPipelineStages({ pipelineId: UUID_A, stageIds: [UUID_B] });
    expect(fake.calls[0]).toEqual({
      fn: "reorder_pipeline_stages",
      args: { p_pipeline_id: UUID_A, p_stage_ids: [UUID_B] },
    });
  });
});

describe("deletePipelineStage", () => {
  it("mapeia QARVON_REASSIGN_STAGE_REQUIRED quando a stage tem leads e nenhum destino foi informado", async () => {
    const fake = fakeSupabase({ data: null, error: { message: "QARVON_REASSIGN_STAGE_REQUIRED" } });
    createClient.mockResolvedValue(fake.client);

    await expect(deletePipelineStage({ stageId: UUID_A })).rejects.toMatchObject({
      code: "REASSIGN_STAGE_REQUIRED",
    });
  });

  it("passa reassignToStageId quando informado", async () => {
    const fake = fakeSupabase({ data: null, error: null });
    createClient.mockResolvedValue(fake.client);

    await deletePipelineStage({ stageId: UUID_A, reassignToStageId: UUID_B });
    expect(fake.calls[0]).toEqual({
      fn: "delete_pipeline_stage",
      args: { p_stage_id: UUID_A, p_reassign_to_stage_id: UUID_B },
    });
  });
});

describe("closeLeadWon", () => {
  it("exige mrr ou tcv (validado no schema, antes da RPC)", async () => {
    await expect(closeLeadWon({ leadId: UUID_A, targetStageId: UUID_B })).rejects.toThrow();
  });

  it("retorna leadId/dealId a partir da primeira linha da RPC", async () => {
    const fake = fakeSupabase({ data: [{ lead_id: UUID_A, deal_id: UUID_B }], error: null });
    createClient.mockResolvedValue(fake.client);

    const result = await closeLeadWon({ leadId: UUID_A, targetStageId: UUID_B, mrr: 2500 });
    expect(result).toEqual({ leadId: UUID_A, dealId: UUID_B });
  });

  it("mapeia QARVON_DEAL_VALUE_REQUIRED vindo do banco (defesa em profundidade além do schema)", async () => {
    const fake = fakeSupabase({ data: null, error: { message: "QARVON_DEAL_VALUE_REQUIRED" } });
    createClient.mockResolvedValue(fake.client);

    await expect(
      closeLeadWon({ leadId: UUID_A, targetStageId: UUID_B, tcv: 15000 }),
    ).rejects.toMatchObject({ code: "DEAL_VALUE_REQUIRED" });
  });
});

describe("closeLeadLost", () => {
  it("chama close_lead_lost com lostReasonId/lostNote nulos por padrão", async () => {
    const fake = fakeSupabase({ data: { id: UUID_A }, error: null });
    createClient.mockResolvedValue(fake.client);

    await closeLeadLost({ leadId: UUID_A, targetStageId: UUID_B });
    expect(fake.calls[0]).toEqual({
      fn: "close_lead_lost",
      args: {
        p_lead_id: UUID_A,
        p_target_stage_id: UUID_B,
        p_lost_reason_id: null,
        p_lost_note: null,
      },
    });
  });
});
