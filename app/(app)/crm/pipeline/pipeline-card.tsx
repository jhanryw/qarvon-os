"use client";

import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils/cn";
import type { PipelineBoardCard as PipelineBoardCardData } from "@/lib/pipeline/queries";

export interface StageOption {
  id: string;
  name: string;
}

interface PipelineCardProps {
  card: PipelineBoardCardData;
  moveOptions: StageOption[];
  onOpen: (leadId: string) => void;
  onMoveTo: (leadId: string, targetStageId: string) => void;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatAge(createdAt: string): string {
  const days = Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 0) return "hoje";
  if (days === 1) return "há 1 dia";
  return `há ${days} dias`;
}

// Arrastável pelo card inteiro (padrão Trello) — o activationConstraint de
// distância configurado no sensor (ver pipeline-board.tsx) é o que permite
// clique e arraste coexistirem sem ambiguidade: um clique sem movimento
// nunca inicia drag, então o botão de abrir o lead continua funcionando
// normalmente por baixo dos mesmos listeners.
export function PipelineCard({ card, moveOptions, onOpen, onMoveTo }: PipelineCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "touch-none rounded-md border border-neutral-200 bg-white p-3 shadow-sm",
        isDragging && "z-10 opacity-50",
      )}
      {...listeners}
      {...attributes}
    >
      <button
        type="button"
        onClick={() => onOpen(card.id)}
        className="block w-full cursor-pointer text-left"
      >
        <p className="text-sm font-medium text-neutral-900">{card.name}</p>
        {card.company && <p className="text-xs text-neutral-500">{card.company}</p>}
        {card.whatsapp && <p className="text-xs text-neutral-500">{card.whatsapp}</p>}

        {(card.revenueRange || card.investsPaidTraffic != null) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {card.revenueRange && (
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">
                {card.revenueRange}
              </span>
            )}
            {card.investsPaidTraffic != null && (
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">
                {card.investsPaidTraffic ? "Investe em tráfego" : "Não investe em tráfego"}
              </span>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-400">
          <span>{formatAge(card.createdAt)}</span>
          {card.leadSourceName && <span>{card.leadSourceName}</span>}
        </div>

        {card.ownerName && (
          <p className="mt-1 text-[11px] text-neutral-400">Responsável: {card.ownerName}</p>
        )}

        {card.dealMrr != null || card.dealTcv != null ? (
          <p className="mt-2 text-sm font-semibold text-emerald-700">
            {[
              card.dealTcv != null ? `TCV ${formatCurrency(card.dealTcv)}` : null,
              card.dealMrr != null ? `MRR ${formatCurrency(card.dealMrr)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : card.estimatedValue != null ? (
          <p className="mt-2 text-sm font-semibold text-neutral-900">
            {formatCurrency(card.estimatedValue)}
          </p>
        ) : null}

        {card.lostReasonName && (
          <p className="mt-2 text-xs text-red-600">Motivo: {card.lostReasonName}</p>
        )}
      </button>

      {/* Fallback de mover (mobile/acessibilidade) — sempre visível, não só
          quando o drag por toque falha. stopPropagation evita que o
          listener de drag do card capture o toque destinado ao select. */}
      <div className="mt-2" onPointerDown={(event) => event.stopPropagation()}>
        <label className="block text-[11px] text-neutral-400">
          Mover para...
          <select
            className="mt-0.5 w-full rounded border border-neutral-200 bg-white px-1.5 py-1 text-xs text-neutral-700"
            value=""
            onChange={(event) => {
              const target = event.target.value;
              if (target) onMoveTo(card.id, target);
              event.target.value = "";
            }}
          >
            <option value="" disabled>
              Escolher etapa
            </option>
            {moveOptions.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
