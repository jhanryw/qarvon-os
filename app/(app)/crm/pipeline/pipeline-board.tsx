"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { PipelineColumn } from "@/app/(app)/crm/pipeline/pipeline-column";
import { CloseWonModal } from "@/app/(app)/crm/pipeline/close-won-modal";
import { CloseLostModal } from "@/app/(app)/crm/pipeline/close-lost-modal";
import { EditLeadDrawer } from "@/app/(app)/crm/edit-lead-drawer";
import { moveLeadAction } from "@/lib/pipeline/actions";
import { applyOptimisticMove, findCardInBoard } from "@/lib/pipeline/board-helpers";
import type { PipelineBoard, PipelineBoardCard, LostReason } from "@/lib/pipeline/queries";

interface PipelineBoardClientProps {
  board: PipelineBoard;
  lostReasons: LostReason[];
}

interface PendingClose {
  card: PipelineBoardCard;
  targetStageId: string;
}

export function PipelineBoardClient({ board: initialBoard, lostReasons }: PipelineBoardClientProps) {
  const router = useRouter();
  const [board, setBoard] = useState(initialBoard);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [pendingWon, setPendingWon] = useState<PendingClose | null>(null);
  const [pendingLost, setPendingLost] = useState<PendingClose | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [, startTransition] = useTransition();

  // distance no PointerSensor é o que permite clique (abrir lead) e
  // arraste coexistirem no mesmo card, sem gesto dedicado — um clique sem
  // deslocamento nunca ultrapassa o limiar e não inicia drag. delay+
  // tolerance no TouchSensor evita que um scroll horizontal da lista de
  // colunas no mobile seja capturado como início de drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  function showToast(message: string, tone: "success" | "error") {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 4000);
  }

  const allStageOptions = board.columns.map((column) => ({
    id: column.stage.id,
    name: column.stage.name,
  }));

  function requestMove(leadId: string, targetStageId: string) {
    const found = findCardInBoard(board, leadId);
    if (!found || found.card.stageId === targetStageId) return;

    const targetColumn = board.columns.find((column) => column.stage.id === targetStageId);
    if (!targetColumn) return;

    if (targetColumn.stage.stage_type === "WON") {
      setPendingWon({ card: found.card, targetStageId });
      return;
    }
    if (targetColumn.stage.stage_type === "LOST") {
      setPendingLost({ card: found.card, targetStageId });
      return;
    }

    // OPEN -> OPEN: move visualmente na hora (otimista) e persiste via
    // move_lead_to_stage. Se o backend falhar, desfaz o board para o
    // snapshot anterior — nunca deixa a UI divergente do banco.
    const snapshot = board;
    setBoard((prev) => applyOptimisticMove(prev, leadId, targetStageId));

    startTransition(async () => {
      const result = await moveLeadAction({ leadId, targetStageId });
      if (result.success) {
        router.refresh();
      } else {
        setBoard(snapshot);
        showToast(result.message ?? "Falha ao mover lead.", "error");
      }
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    requestMove(String(event.active.id), String(event.over.id));
  }

  function handleWonConfirmed(values: { mrr: number | null; tcv: number | null }) {
    if (!pendingWon) return;
    setBoard((prev) =>
      applyOptimisticMove(prev, pendingWon.card.id, pendingWon.targetStageId, {
        dealMrr: values.mrr,
        dealTcv: values.tcv,
      }),
    );
    setPendingWon(null);
    showToast("Negócio marcado como Ganho.", "success");
    router.refresh();
  }

  function handleLostConfirmed(values: { lostReasonName: string | null }) {
    if (!pendingLost) return;
    setBoard((prev) =>
      applyOptimisticMove(prev, pendingLost.card.id, pendingLost.targetStageId, {
        lostReasonName: values.lostReasonName,
      }),
    );
    setPendingLost(null);
    showToast("Lead marcado como perdido.", "success");
    router.refresh();
  }

  return (
    <div>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 snap-x">
          {board.columns.map((column) => (
            <PipelineColumn
              key={column.stage.id}
              column={column}
              moveOptions={allStageOptions}
              onOpenLead={setEditingLeadId}
              onMoveTo={requestMove}
            />
          ))}
        </div>
      </DndContext>

      <CloseWonModal
        card={pendingWon?.card ?? null}
        targetStageId={pendingWon?.targetStageId ?? null}
        onClose={() => setPendingWon(null)}
        onConfirmed={handleWonConfirmed}
        onFailed={(message) => showToast(message, "error")}
      />

      <CloseLostModal
        card={pendingLost?.card ?? null}
        targetStageId={pendingLost?.targetStageId ?? null}
        lostReasons={lostReasons}
        onClose={() => setPendingLost(null)}
        onConfirmed={handleLostConfirmed}
        onFailed={(message) => showToast(message, "error")}
      />

      <EditLeadDrawer
        leadId={editingLeadId}
        onClose={() => setEditingLeadId(null)}
        onSuccess={() => {
          setEditingLeadId(null);
          showToast("Lead atualizado com sucesso.", "success");
          router.refresh();
        }}
      />

      {toast && (
        <div
          role="status"
          className={
            toast.tone === "success"
              ? "fixed bottom-4 right-4 z-50 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg"
              : "fixed bottom-4 right-4 z-50 rounded-md bg-red-600 px-4 py-2 text-sm text-white shadow-lg"
          }
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
