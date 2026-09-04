import { Card } from "@/components/ui/card";
import { listLeadSources, listLeads } from "@/lib/leads/queries";
import { listOrganizationProfiles } from "@/lib/profiles/queries";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { parseLeadListSearchParams } from "@/lib/leads/search-params";
import { AppError } from "@/lib/errors";
import { NewLeadButton } from "@/app/(app)/crm/new-lead-button";
import { LeadsListSection } from "@/app/(app)/crm/leads-list-section";
import type { ListLeadsResult } from "@/lib/leads/queries";

const PAGE_SIZE = 20;

interface CrmPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CrmPage({ searchParams }: CrmPageProps) {
  const params = parseLeadListSearchParams(await searchParams);

  const [leadSources, profiles, { organization }] = await Promise.all([
    listLeadSources(),
    listOrganizationProfiles(),
    getTenantContext(),
  ]);

  // Erro real de infraestrutura não pode parecer "nenhum lead cadastrado" —
  // são estados completamente diferentes para quem opera o CRM.
  let leadsResult: ListLeadsResult | null = null;
  try {
    leadsResult = await listLeads({
      page: params.page,
      pageSize: PAGE_SIZE,
      search: params.search,
      ownerId: params.ownerId,
      leadSourceId: params.leadSourceId,
      temperature: params.temperature,
    });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
  }

  const hasFilters = Boolean(
    params.search || params.ownerId || params.leadSourceId || params.temperature,
  );
  const total = leadsResult?.total ?? 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">CRM</h1>
          <p className="text-sm text-neutral-500">
            {leadsResult === null
              ? " "
              : total === 0
                ? "Nenhum lead cadastrado ainda."
                : `${total} lead${total === 1 ? "" : "s"} cadastrado${total === 1 ? "" : "s"}.`}
          </p>
        </div>
        <NewLeadButton leadSources={leadSources} profiles={profiles} />
      </div>

      {leadsResult === null ? (
        <Card>
          <p className="text-sm text-red-700">
            Não foi possível carregar os leads agora. Tente novamente em
            instantes.
          </p>
        </Card>
      ) : total === 0 && !hasFilters ? (
        <Card>
          <p className="text-sm text-neutral-500">
            Cadastre seu primeiro lead para começar a organizar o funil
            comercial.
          </p>
        </Card>
      ) : (
        <LeadsListSection
          leads={leadsResult.leads}
          timezone={organization.timezone}
          leadSources={leadSources}
          profiles={profiles}
          page={leadsResult.page}
          pageSize={leadsResult.pageSize}
          total={leadsResult.total}
        />
      )}
    </div>
  );
}
