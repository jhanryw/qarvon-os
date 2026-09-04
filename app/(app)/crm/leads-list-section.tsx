"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { LeadsFilterBar } from "@/app/(app)/crm/leads-filter-bar";
import { LeadsTable } from "@/app/(app)/crm/leads-table";
import { LeadsPagination } from "@/app/(app)/crm/leads-pagination";
import { EditLeadDrawer } from "@/app/(app)/crm/edit-lead-drawer";
import type { LeadListItem, LeadSource } from "@/lib/leads/queries";
import type { ProfileOption } from "@/lib/profiles/queries";

interface LeadsListSectionProps {
  leads: LeadListItem[];
  timezone: string;
  leadSources: LeadSource[];
  profiles: ProfileOption[];
  page: number;
  pageSize: number;
  total: number;
}

export function LeadsListSection({
  leads,
  timezone,
  leadSources,
  profiles,
  page,
  pageSize,
  total,
}: LeadsListSectionProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Remonta a barra de filtros quando a query string muda por fora dela
  // mesma (ex.: "Limpar filtros", back/forward do navegador) — os selects
  // usam defaultValue (não controlado) e não re-sincronizariam sozinhos.
  const filtersKey = searchParams.toString();

  function handleEditSuccess() {
    setEditingLeadId(null);
    setToast("Lead atualizado com sucesso.");
    router.refresh();
    setTimeout(() => setToast(null), 3000);
  }

  return (
    <>
      <LeadsFilterBar
        key={filtersKey}
        leadSources={leadSources}
        profiles={profiles}
      />

      {leads.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-500">
            Nenhum lead encontrado com os filtros atuais.
          </p>
        </Card>
      ) : (
        <LeadsTable
          leads={leads}
          timezone={timezone}
          onEditLead={setEditingLeadId}
        />
      )}

      <LeadsPagination page={page} pageSize={pageSize} total={total} />

      <EditLeadDrawer
        leadId={editingLeadId}
        onClose={() => setEditingLeadId(null)}
        onSuccess={handleEditSuccess}
      />

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
