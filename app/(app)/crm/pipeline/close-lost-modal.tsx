"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { closeLeadLostAction } from "@/lib/pipeline/actions";
import type { PipelineBoardCard, LostReason } from "@/lib/pipeline/queries";

export interface CloseLostValues {
  lostReasonName: string | null;
}

interface CloseLostModalProps {
  card: PipelineBoardCard | null;
  targetStageId: string | null;
  lostReasons: LostReason[];
  onClose: () => void;
  onConfirmed: (values: CloseLostValues) => void;
  onFailed: (message: string) => void;
}

// Arrastar para Perdido também nunca é silencioso — motivo é fortemente
// recomendado pela UI (não uma trava de banco: close_lead_lost aceita
// p_lost_reason_id nulo, mesma flexibilidade de qualquer FK opcional já
// existente no projeto).
export function CloseLostModal({
  card,
  targetStageId,
  lostReasons,
  onClose,
  onConfirmed,
  onFailed,
}: CloseLostModalProps) {
  const [lostReasonId, setLostReasonId] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setLostReasonId("");
    setNote("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!card || !targetStageId) return;

    startTransition(async () => {
      const result = await closeLeadLostAction({
        leadId: card.id,
        targetStageId,
        lostReasonId: lostReasonId || null,
        lostNote: note.trim() || null,
      });

      if (result.success) {
        const reasonName = lostReasons.find((reason) => reason.id === lostReasonId)?.name ?? null;
        onConfirmed({ lostReasonName: reasonName });
        reset();
      } else {
        handleClose();
        onFailed(result.message ?? "Falha ao marcar lead como perdido.");
      }
    });
  }

  return (
    <Sheet open={card !== null} onClose={handleClose} title="Marcar como Perdido">
      {card && (
        <form onSubmit={handleSubmit}>
          <p className="mb-4 text-sm text-neutral-600">
            Lead: <span className="font-medium text-neutral-900">{card.name}</span>
          </p>

          <div className="mb-4">
            <Label htmlFor="close-lost-reason">Motivo da perda</Label>
            <Select
              id="close-lost-reason"
              value={lostReasonId}
              onChange={(event) => setLostReasonId(event.target.value)}
              autoFocus
            >
              <option value="">Selecione um motivo (opcional)</option>
              {lostReasons.map((reason) => (
                <option key={reason.id} value={reason.id}>
                  {reason.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="mb-4">
            <Label htmlFor="close-lost-note">Observação (opcional)</Label>
            <Textarea
              id="close-lost-note"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <div className="sticky bottom-0 mt-4 flex gap-2 border-t border-neutral-200 bg-white pt-4 pb-1">
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? "Salvando..." : "Confirmar Perda"}
            </Button>
            <Button type="button" variant="secondary" onClick={handleClose} disabled={isPending}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
