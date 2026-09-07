"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { closeLeadWonAction } from "@/lib/pipeline/actions";
import type { PipelineBoardCard } from "@/lib/pipeline/queries";

export interface CloseWonValues {
  mrr: number | null;
  tcv: number | null;
  note: string | null;
}

interface CloseWonModalProps {
  card: PipelineBoardCard | null;
  targetStageId: string | null;
  onClose: () => void;
  onConfirmed: (values: CloseWonValues) => void;
  onFailed: (message: string) => void;
}

// Arrastar para Ganho NUNCA move silenciosamente — este modal é obrigatório
// (ver pipeline-board.tsx: o drop em uma coluna WON abre o modal em vez de
// mover direto) porque MRR/TCV são dados reais do negócio, não podem ficar
// vazios.
export function CloseWonModal({
  card,
  targetStageId,
  onClose,
  onConfirmed,
  onFailed,
}: CloseWonModalProps) {
  const [mrr, setMrr] = useState("");
  const [tcv, setTcv] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setMrr("");
    setTcv("");
    setNote("");
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function parseMoney(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const value = Number(trimmed.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(value) ? value : NaN;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!card || !targetStageId) return;

    const mrrValue = parseMoney(mrr);
    const tcvValue = parseMoney(tcv);

    if (Number.isNaN(mrrValue) || Number.isNaN(tcvValue)) {
      setError("MRR e TCV precisam ser números válidos.");
      return;
    }
    if (mrrValue == null && tcvValue == null) {
      setError("Informe pelo menos o MRR ou o TCV.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await closeLeadWonAction({
        leadId: card.id,
        targetStageId,
        mrr: mrrValue,
        tcv: tcvValue,
        note: note.trim() || null,
      });

      if (result.success) {
        onConfirmed({ mrr: mrrValue, tcv: tcvValue, note: note.trim() || null });
        reset();
      } else {
        handleClose();
        onFailed(result.message ?? "Falha ao fechar negócio.");
      }
    });
  }

  return (
    <Sheet open={card !== null} onClose={handleClose} title="Fechar negócio como Ganho">
      {card && (
        <form onSubmit={handleSubmit}>
          <p className="mb-4 text-sm text-neutral-600">
            Cliente: <span className="font-medium text-neutral-900">{card.name}</span>
            {card.company ? ` — ${card.company}` : ""}
          </p>

          {error && (
            <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="mb-4">
            <Label htmlFor="close-won-mrr">MRR (recorrência mensal)</Label>
            <Input
              id="close-won-mrr"
              inputMode="decimal"
              placeholder="Ex.: 2500"
              value={mrr}
              onChange={(event) => setMrr(event.target.value)}
              autoFocus
            />
          </div>

          <div className="mb-4">
            <Label htmlFor="close-won-tcv">TCV (valor total do contrato)</Label>
            <Input
              id="close-won-tcv"
              inputMode="decimal"
              placeholder="Ex.: 15000"
              value={tcv}
              onChange={(event) => setTcv(event.target.value)}
            />
          </div>

          <div className="mb-4">
            <Label htmlFor="close-won-note">Observação (opcional)</Label>
            <Textarea
              id="close-won-note"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <div className="sticky bottom-0 mt-4 flex gap-2 border-t border-neutral-200 bg-white pt-4 pb-1">
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? "Salvando..." : "Confirmar Ganho"}
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
