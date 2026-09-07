import { Card } from "@/components/ui/card";
import { SettingsSubnav } from "@/app/(app)/configuracoes/settings-subnav";
import { getDefaultPipeline, listPipelineStages } from "@/lib/pipeline/queries";
import { AppError } from "@/lib/errors";
import { PipelineSettingsClient } from "@/app/(app)/configuracoes/pipeline/pipeline-settings-client";
import type { PipelineStageWithFlags } from "@/lib/pipeline/queries";

export default async function PipelineSettingsPage() {
  let loaded: { pipelineId: string; stages: PipelineStageWithFlags[] } | null = null;
  let errorMessage: string | null = null;

  try {
    const pipeline = await getDefaultPipeline();
    const stages = await listPipelineStages(pipeline.id);
    loaded = { pipelineId: pipeline.id, stages };
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    errorMessage =
      error.code === "NO_DEFAULT_PIPELINE"
        ? "Nenhum pipeline configurado para esta organização ainda."
        : "Não foi possível carregar as etapas do pipeline agora. Tente novamente em instantes.";
  }

  return (
    <div>
      <SettingsSubnav active="pipeline" />
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Pipeline</h1>
        <p className="text-sm text-neutral-500">
          Lead Novo, Ganho e Perdido são estruturais e não podem ser removidos.
          As etapas entre elas são livres — crie, renomeie, reordene e
          desative quantas fizerem sentido para o seu funil.
        </p>
      </div>

      {errorMessage ? (
        <Card>
          <p className="text-sm text-red-700">{errorMessage}</p>
        </Card>
      ) : loaded ? (
        <PipelineSettingsClient pipelineId={loaded.pipelineId} initialStages={loaded.stages} />
      ) : null}
    </div>
  );
}
