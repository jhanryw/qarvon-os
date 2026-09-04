"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Sheet } from "@/components/ui/sheet";
import { EditLeadForm } from "@/app/(app)/crm/edit-lead-form";
import { loadLeadForEditAction } from "@/lib/leads/actions";
import type { Lead, LeadSource } from "@/lib/leads/queries";
import type { ProfileOption } from "@/lib/profiles/queries";

interface EditLeadDrawerProps {
  leadId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface LoadedData {
  lead: Lead;
  leadSources: LeadSource[];
  profiles: ProfileOption[];
}

// Carrega o lead completo sob demanda (getLeadById via Server Action) ao
// abrir — nunca confia nos dados já renderizados na tabela, que não têm
// todos os campos.
export function EditLeadDrawer({
  leadId,
  onClose,
  onSuccess,
}: EditLeadDrawerProps) {
  const [data, setData] = useState<LoadedData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, startLoadTransition] = useTransition();
  const dirtyRef = useRef(false);

  useEffect(() => {
    // Nada a buscar quando fechado — o Sheet já esconde o conteúdo
    // (open={leadId !== null}), e o próximo carregamento (quando um novo
    // leadId chegar) já limpa data/loadError antes de buscar.
    if (!leadId) return;

    let cancelled = false;

    startLoadTransition(async () => {
      const result = await loadLeadForEditAction(leadId);
      if (cancelled) return;

      setLoadError(null);
      setData(null);
      if (
        result.status === "success" &&
        result.lead &&
        result.leadSources &&
        result.profiles
      ) {
        setData({
          lead: result.lead,
          leadSources: result.leadSources,
          profiles: result.profiles,
        });
      } else {
        setLoadError(
          result.message ?? "Não foi possível carregar o lead. Tente novamente.",
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [leadId]);

  function handleClose() {
    if (dirtyRef.current) {
      const confirmed = window.confirm(
        "Existem alterações não salvas neste lead. Fechar sem salvar?",
      );
      if (!confirmed) return;
    }
    dirtyRef.current = false;
    onClose();
  }

  function handleSuccess() {
    dirtyRef.current = false;
    onSuccess();
  }

  return (
    <Sheet open={leadId !== null} onClose={handleClose} title="Editar lead">
      {isLoading && (
        <p className="py-8 text-center text-sm text-neutral-500">
          Carregando lead...
        </p>
      )}

      {!isLoading && loadError && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {loadError}
        </p>
      )}

      {!isLoading && data && (
        <EditLeadForm
          lead={data.lead}
          leadSources={data.leadSources}
          profiles={data.profiles}
          onSuccess={handleSuccess}
          onCancel={handleClose}
          onDirtyChange={(dirty) => {
            dirtyRef.current = dirty;
          }}
        />
      )}
    </Sheet>
  );
}
