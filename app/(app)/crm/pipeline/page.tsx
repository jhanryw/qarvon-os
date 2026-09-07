import { Card } from "@/components/ui/card";
import { CrmSubnav } from "@/app/(app)/crm/crm-subnav";
import { getPipelineBoard, listLostReasons } from "@/lib/pipeline/queries";
import { AppError } from "@/lib/errors";
import { PipelineBoardClient } from "@/app/(app)/crm/pipeline/pipeline-board";
import type { PipelineBoard } from "@/lib/pipeline/queries";

// Kanban — entrada principal do CRM (era inacessível pelo sidebar até
// esta entrega). Carrega o board inteiro server-side (poucas queries, ver
// getPipelineBoard) e entrega para o client component cuidar de
// drag-and-drop/otimismo/modais.
export default async function PipelinePage() {
  let board: PipelineBoard | null = null;
  let loadErrorMessage: string | null = null;

  try {
    board = await getPipelineBoard();
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    loadErrorMessage =
      error.code === "NO_DEFAULT_PIPELINE"
        ? "Nenhum pipeline configurado para esta organização ainda."
        : "Não foi possível carregar o pipeline agora. Tente novamente em instantes.";
  }

  const lostReasons = board ? await listLostReasons() : [];

  return (
    <div>
      <CrmSubnav active="pipeline" />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Pipeline</h1>
        <p className="text-sm text-neutral-500">
          Acompanhe os leads do funil comercial, da entrada até o fechamento.
        </p>
      </div>

      {loadErrorMessage ? (
        <Card>
          <p className="text-sm text-red-700">{loadErrorMessage}</p>
        </Card>
      ) : board ? (
        <PipelineBoardClient board={board} lostReasons={lostReasons} />
      ) : null}
    </div>
  );
}
