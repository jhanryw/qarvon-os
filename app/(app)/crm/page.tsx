import { Card } from "@/components/ui/card";
import { listLeadSources, listLeads } from "@/lib/leads/queries";
import { listOrganizationProfiles } from "@/lib/profiles/queries";
import { NewLeadButton } from "@/app/(app)/crm/new-lead-button";

export default async function CrmPage() {
  const [leadSources, profiles, leadsSummary] = await Promise.all([
    listLeadSources(),
    listOrganizationProfiles(),
    listLeads({ pageSize: 1 }),
  ]);

  const total = leadsSummary.total;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">CRM</h1>
          <p className="text-sm text-neutral-500">
            {total === 0
              ? "Nenhum lead cadastrado ainda."
              : `${total} lead${total === 1 ? "" : "s"} cadastrado${total === 1 ? "" : "s"}.`}
          </p>
        </div>
        <NewLeadButton leadSources={leadSources} profiles={profiles} />
      </div>

      {total === 0 && (
        <Card>
          <p className="text-sm text-neutral-500">
            Cadastre seu primeiro lead para começar a organizar o funil
            comercial.
          </p>
        </Card>
      )}
    </div>
  );
}
