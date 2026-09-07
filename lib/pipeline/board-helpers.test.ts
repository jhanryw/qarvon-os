import { describe, expect, it } from "vitest";
import { applyOptimisticMove, findCardInBoard } from "@/lib/pipeline/board-helpers";
import type { PipelineBoard, PipelineBoardCard } from "@/lib/pipeline/queries";

function makeCard(overrides: Partial<PipelineBoardCard> = {}): PipelineBoardCard {
  return {
    id: "lead-1",
    name: "Lead Teste",
    company: null,
    whatsapp: null,
    revenueRange: null,
    investsPaidTraffic: null,
    estimatedValue: 1000,
    createdAt: new Date().toISOString(),
    leadSourceName: null,
    ownerName: null,
    stageId: "stage-open",
    dealMrr: null,
    dealTcv: null,
    lostReasonName: null,
    ...overrides,
  };
}

function makeBoard(): PipelineBoard {
  return {
    pipelineId: "pipeline-1",
    columns: [
      {
        stage: {
          id: "stage-open",
          organization_id: "org-1",
          pipeline_id: "pipeline-1",
          name: "Novo Lead",
          position: 1,
          probability: 5,
          stage_type: "OPEN",
          active: true,
          created_at: "",
          updated_at: "",
          isLeadNovo: true,
        },
        leadCount: 1,
        totalValue: 1000,
        cards: [makeCard()],
      },
      {
        stage: {
          id: "stage-qualified",
          organization_id: "org-1",
          pipeline_id: "pipeline-1",
          name: "Qualificado",
          position: 2,
          probability: 25,
          stage_type: "OPEN",
          active: true,
          created_at: "",
          updated_at: "",
          isLeadNovo: false,
        },
        leadCount: 0,
        totalValue: 0,
        cards: [],
      },
      {
        stage: {
          id: "stage-won",
          organization_id: "org-1",
          pipeline_id: "pipeline-1",
          name: "Fechado",
          position: 3,
          probability: 100,
          stage_type: "WON",
          active: true,
          created_at: "",
          updated_at: "",
          isLeadNovo: false,
        },
        leadCount: 0,
        totalValue: 0,
        cards: [],
      },
      {
        stage: {
          id: "stage-lost",
          organization_id: "org-1",
          pipeline_id: "pipeline-1",
          name: "Perdido",
          position: 4,
          probability: 0,
          stage_type: "LOST",
          active: true,
          created_at: "",
          updated_at: "",
          isLeadNovo: false,
        },
        leadCount: 0,
        totalValue: 0,
        cards: [],
      },
    ],
  };
}

describe("findCardInBoard", () => {
  it("encontra um card existente e a coluna que o contém", () => {
    const board = makeBoard();
    const found = findCardInBoard(board, "lead-1");
    expect(found?.card.id).toBe("lead-1");
    expect(found?.column.stage.id).toBe("stage-open");
  });

  it("retorna null para um lead que não existe no board", () => {
    const board = makeBoard();
    expect(findCardInBoard(board, "lead-inexistente")).toBeNull();
  });
});

describe("applyOptimisticMove — OPEN -> OPEN", () => {
  it("move o card para a coluna de destino e recalcula count/soma das duas colunas", () => {
    const board = makeBoard();
    const result = applyOptimisticMove(board, "lead-1", "stage-qualified");

    const origin = result.columns.find((c) => c.stage.id === "stage-open")!;
    const target = result.columns.find((c) => c.stage.id === "stage-qualified")!;

    expect(origin.cards).toHaveLength(0);
    expect(origin.leadCount).toBe(0);
    expect(origin.totalValue).toBe(0);

    expect(target.cards).toHaveLength(1);
    expect(target.cards[0].stageId).toBe("stage-qualified");
    expect(target.leadCount).toBe(1);
    expect(target.totalValue).toBe(1000);
  });

  it("não modifica colunas não envolvidas na movimentação", () => {
    const board = makeBoard();
    const result = applyOptimisticMove(board, "lead-1", "stage-qualified");
    const won = result.columns.find((c) => c.stage.id === "stage-won")!;
    expect(won).toEqual(board.columns.find((c) => c.stage.id === "stage-won"));
  });

  it("é no-op quando o lead já está na stage de destino", () => {
    const board = makeBoard();
    const result = applyOptimisticMove(board, "lead-1", "stage-open");
    expect(result).toBe(board);
  });

  it("é no-op quando o lead não existe no board", () => {
    const board = makeBoard();
    const result = applyOptimisticMove(board, "lead-inexistente", "stage-qualified");
    expect(result).toBe(board);
  });
});

describe("applyOptimisticMove — para WON", () => {
  it("aplica o patch de MRR/TCV e soma pelo TCV (preferencialmente ao MRR) na coluna WON", () => {
    const board = makeBoard();
    const result = applyOptimisticMove(board, "lead-1", "stage-won", {
      dealMrr: 2500,
      dealTcv: 15000,
    });

    const won = result.columns.find((c) => c.stage.id === "stage-won")!;
    expect(won.leadCount).toBe(1);
    expect(won.totalValue).toBe(15000);
    expect(won.cards[0].dealMrr).toBe(2500);
    expect(won.cards[0].dealTcv).toBe(15000);
  });

  it("some pelo MRR quando não há TCV informado", () => {
    const board = makeBoard();
    const result = applyOptimisticMove(board, "lead-1", "stage-won", { dealMrr: 2500 });
    const won = result.columns.find((c) => c.stage.id === "stage-won")!;
    expect(won.totalValue).toBe(2500);
  });
});

describe("applyOptimisticMove — para LOST", () => {
  it("aplica o motivo de perda e mantém a soma pelo estimated_value (não pelo deal)", () => {
    const board = makeBoard();
    const result = applyOptimisticMove(board, "lead-1", "stage-lost", {
      lostReasonName: "Sem orçamento",
    });

    const lost = result.columns.find((c) => c.stage.id === "stage-lost")!;
    expect(lost.leadCount).toBe(1);
    expect(lost.totalValue).toBe(1000);
    expect(lost.cards[0].lostReasonName).toBe("Sem orçamento");
  });
});
