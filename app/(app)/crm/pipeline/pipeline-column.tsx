"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils/cn";
import { PipelineCard, type StageOption } from "@/app/(app)/crm/pipeline/pipeline-card";
import type { PipelineBoardColumn as PipelineBoardColumnData } from "@/lib/pipeline/queries";

interface PipelineColumnProps {
  column: PipelineBoardColumnData;
  moveOptions: StageOption[];
  onOpenLead: (leadId: string) => void;
  onMoveTo: (leadId: string, targetStageId: string) => void;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function valueLabel(stage_type: PipelineBoardColumnData["stage"]["stage_type"]): string {
  if (stage_type === "WON") return "Valor total fechado";
  if (stage_type === "LOST") return "Em negociação antes da perda";
  return "Em aberto";
}

export function PipelineColumn({
  column,
  moveOptions,
  onOpenLead,
  onMoveTo,
}: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.stage.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 snap-start flex-col rounded-lg border bg-neutral-50 sm:w-80",
        isOver ? "border-neutral-900 bg-neutral-100" : "border-neutral-200",
      )}
    >
      <div className="border-b border-neutral-200 px-3 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">{column.stage.name}</h2>
          {column.stage.isLeadNovo && (
            <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
              Lead Novo
            </span>
          )}
          {column.stage.stage_type === "WON" && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
              Ganho
            </span>
          )}
          {column.stage.stage_type === "LOST" && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
              Perdido
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          {column.leadCount} lead{column.leadCount === 1 ? "" : "s"}
        </p>
        <p className="text-xs text-neutral-500">
          {valueLabel(column.stage.stage_type)}: {formatCurrency(column.totalValue)}
        </p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {column.cards.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-neutral-400">
            Nenhum lead nesta etapa.
          </p>
        ) : (
          column.cards.map((card) => (
            <PipelineCard
              key={card.id}
              card={card}
              moveOptions={moveOptions.filter((option) => option.id !== column.stage.id)}
              onOpen={onOpenLead}
              onMoveTo={onMoveTo}
            />
          ))
        )}
      </div>
    </div>
  );
}
