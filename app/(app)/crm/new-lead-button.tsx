"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { NewLeadForm } from "@/app/(app)/crm/new-lead-form";
import type { LeadSource } from "@/lib/leads/queries";
import type { ProfileOption } from "@/lib/profiles/queries";

interface NewLeadButtonProps {
  leadSources: LeadSource[];
  profiles: ProfileOption[];
}

export function NewLeadButton({ leadSources, profiles }: NewLeadButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  function handleClose() {
    if (dirtyRef.current) {
      const confirmed = window.confirm(
        "Existem informações preenchidas neste formulário. Fechar sem salvar?",
      );
      if (!confirmed) return;
    }
    dirtyRef.current = false;
    setOpen(false);
  }

  function handleSuccess() {
    dirtyRef.current = false;
    setOpen(false);
    setToast("Lead cadastrado com sucesso.");
    router.refresh();
    setTimeout(() => setToast(null), 3000);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Novo lead</Button>

      <Sheet open={open} onClose={handleClose} title="Novo lead">
        <NewLeadForm
          leadSources={leadSources}
          profiles={profiles}
          onSuccess={handleSuccess}
          onCancel={handleClose}
          onDirtyChange={(dirty) => {
            dirtyRef.current = dirty;
          }}
        />
      </Sheet>

      {toast && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-50 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </>
  );
}
