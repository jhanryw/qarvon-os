"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { retryConversionEventAction } from "@/lib/integrations/meta/actions";
import type { ConversionEventSummary } from "@/lib/integrations/meta/queries";

const STATUS_LABEL: Record<ConversionEventSummary["status"], string> = {
  PENDING: "Pendente",
  SENT: "Enviado",
  FAILED: "Falhou",
};

interface RecentConversionsListProps {
  events: ConversionEventSummary[];
}

// Idempotência garante que reenviar nunca duplica o Purchase na Meta — o
// mesmo conversion_events (deal_id + event_name) é só atualizado, nunca
// recriado (ver retryConversionEvent / dispatchWonConversion).
export function RecentConversionsList({ events }: RecentConversionsListProps) {
  const router = useRouter();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleRetry(id: string) {
    setRetryingId(id);
    setMessage(null);
    startTransition(async () => {
      const result = await retryConversionEventAction(id);
      setRetryingId(null);
      setMessage(result.success ? "Reenvio processado." : (result.message ?? "Falha ao reenviar."));
      router.refresh();
    });
  }

  return (
    <div>
      <h2 className="mb-4 text-base font-semibold text-neutral-900">Conversões recentes</h2>
      {message && (
        <p role="status" className="mb-4 text-sm text-neutral-600">
          {message}
        </p>
      )}

      {events.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma conversão registrada ainda.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-neutral-900">{event.leadName ?? "Lead"}</p>
                <p className="text-xs text-neutral-500">
                  {event.eventName} · {STATUS_LABEL[event.status]}
                  {event.lastError ? ` · ${event.lastError}` : ""}
                </p>
              </div>
              {event.status !== "SENT" && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={retryingId === event.id}
                  onClick={() => handleRetry(event.id)}
                >
                  {retryingId === event.id ? "Reenviando..." : "Reenviar"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
