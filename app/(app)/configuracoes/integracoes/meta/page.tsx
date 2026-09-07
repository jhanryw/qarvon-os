import { Card } from "@/components/ui/card";
import { SettingsSubnav } from "@/app/(app)/configuracoes/settings-subnav";
import {
  getMetaIntegrationSettings,
  listRecentConversionEvents,
  type MetaIntegrationSettings,
  type ConversionEventSummary,
} from "@/lib/integrations/meta/queries";
import { AppError } from "@/lib/errors";
import { MetaSettingsForm } from "@/app/(app)/configuracoes/integracoes/meta/meta-settings-form";
import { RecentConversionsList } from "@/app/(app)/configuracoes/integracoes/meta/recent-conversions-list";

export default async function MetaIntegrationPage() {
  let loaded: { settings: MetaIntegrationSettings; events: ConversionEventSummary[] } | null = null;
  let errorMessage: string | null = null;

  try {
    const [settings, events] = await Promise.all([
      getMetaIntegrationSettings(),
      listRecentConversionEvents(),
    ]);
    loaded = { settings, events };
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    errorMessage =
      error.code === "NO_ACCESS"
        ? "Só administradores podem configurar integrações."
        : "Não foi possível carregar a configuração da Meta agora.";
  }

  return (
    <div>
      <SettingsSubnav active="integracoes" />
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Integrações — Meta Ads</h1>
        <p className="text-sm text-neutral-500">
          Quando um lead vira Ganho, o CRM envia a venda para a Meta via
          Conversions API (server-side) — não depende do Pixel do navegador.
        </p>
      </div>

      {errorMessage ? (
        <Card>
          <p className="text-sm text-red-700">{errorMessage}</p>
        </Card>
      ) : loaded ? (
        <div className="space-y-6">
          <Card>
            <MetaSettingsForm initialSettings={loaded.settings} />
          </Card>
          <Card>
            <RecentConversionsList events={loaded.events} />
          </Card>
        </div>
      ) : null}
    </div>
  );
}
