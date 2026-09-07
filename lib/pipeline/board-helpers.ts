import type { PipelineBoard, PipelineBoardCard, PipelineBoardColumn } from "@/lib/pipeline/queries";

// Funções puras (sem side effects, sem imports de servidor) que o board do
// Kanban usa para atualização otimista + rollback. Extraídas do componente
// para serem testáveis isoladamente, sem montar nenhum componente React.

export function findCardInBoard(
  board: PipelineBoard,
  leadId: string,
): { card: PipelineBoardCard; column: PipelineBoardColumn } | null {
  for (const column of board.columns) {
    const card = column.cards.find((candidate) => candidate.id === leadId);
    if (card) return { card, column };
  }
  return null;
}

function computeColumnTotals(
  stage_type: PipelineBoardColumn["stage"]["stage_type"],
  cards: PipelineBoardCard[],
): { leadCount: number; totalValue: number } {
  const leadCount = cards.length;
  const totalValue =
    stage_type === "WON"
      ? cards.reduce((sum, card) => sum + (card.dealTcv ?? card.dealMrr ?? 0), 0)
      : cards.reduce((sum, card) => sum + (card.estimatedValue ?? 0), 0);
  return { leadCount, totalValue };
}

// Move um card de uma coluna para outra, recalculando count/soma das duas
// colunas afetadas — nunca muta o board recebido, sempre retorna uma nova
// árvore (permite comparar referências, útil para snapshot/rollback). Se o
// lead não existir no board ou já estiver no destino, retorna o mesmo board
// (no-op), sem criar uma cópia desnecessária.
export function applyOptimisticMove(
  board: PipelineBoard,
  leadId: string,
  targetStageId: string,
  patch: Partial<PipelineBoardCard> = {},
): PipelineBoard {
  const found = findCardInBoard(board, leadId);
  if (!found || found.card.stageId === targetStageId) return board;

  const updatedCard: PipelineBoardCard = {
    ...found.card,
    ...patch,
    stageId: targetStageId,
  };

  const columns = board.columns.map((column) => {
    if (column.stage.id === found.column.stage.id) {
      const cards = column.cards.filter((card) => card.id !== leadId);
      return { ...column, cards, ...computeColumnTotals(column.stage.stage_type, cards) };
    }
    if (column.stage.id === targetStageId) {
      const cards = [updatedCard, ...column.cards];
      return { ...column, cards, ...computeColumnTotals(column.stage.stage_type, cards) };
    }
    return column;
  });

  return { ...board, columns };
}
