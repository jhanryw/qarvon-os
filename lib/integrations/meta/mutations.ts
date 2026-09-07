import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { AppError, mapQarvonError } from "@/lib/errors";
import { metaIntegrationSettingsSchema } from "@/lib/integrations/meta/schemas";
import type { MetaIntegrationSettings } from "@/lib/integrations/meta/queries";
import { dispatchWonConversion } from "@/lib/integrations/meta/dispatch";

// META_TOKEN_ENCRYPTION_KEY nunca é persistida em lugar nenhum — só passada
// como parâmetro nesta chamada, para a RPC cifrar o token antes de gravar
// em meta_integration_secrets (ver migration
// 20260907100310_create_meta_integration_functions.sql). Ausência dela só
// importa quando um token novo está sendo enviado (accessToken != null);
// salvar outros campos sem trocar o token não deveria exigi-la — mas como
// a RPC só usa a chave quando p_access_token não é nulo, passar undefined
// nesse caso é inofensivo (nunca chega a ser lida).
export async function upsertMetaIntegrationSettings(
  input: unknown,
): Promise<MetaIntegrationSettings> {
  const parsed = metaIntegrationSettingsSchema.parse(input);
  const supabase = await createClient();

  if (parsed.accessToken != null && !process.env.META_TOKEN_ENCRYPTION_KEY) {
    throw new AppError(
      "DATABASE_ERROR",
      "META_TOKEN_ENCRYPTION_KEY não configurado neste ambiente — não é possível salvar um novo token com segurança.",
    );
  }

  const { data, error } = await supabase.rpc("upsert_meta_integration", {
    p_pixel_id: parsed.pixelId ?? null,
    p_access_token: parsed.accessToken ?? null,
    p_encryption_key: parsed.accessToken != null ? process.env.META_TOKEN_ENCRYPTION_KEY! : null,
    p_conversion_value_mode: parsed.conversionValueMode ?? null,
    p_active: parsed.active ?? null,
  });

  if (error) {
    throw mapQarvonError(error, "Falha ao salvar configuração da Meta.");
  }
  const row = data?.[0];
  if (!row) {
    throw new AppError(
      "DATABASE_ERROR",
      "Falha ao salvar configuração da Meta.",
    );
  }
  return {
    pixelId: row.pixel_id,
    conversionValueMode: row.conversion_value_mode,
    active: row.active,
    hasAccessToken: row.has_access_token,
  };
}

// Reenvio manual de uma conversão pendente/falha. A leitura do evento passa
// pelo client autenticado (RLS confirma que o evento pertence à
// organização do usuário atual) — só depois disso delegamos para
// dispatchWonConversion (que usa o client admin internamente para ler o
// segredo da Meta). Nunca aceita organization_id do chamador.
export async function retryConversionEvent(conversionEventId: string): Promise<void> {
  const { organizationId } = await getTenantContext();
  const supabase = await createClient();

  const { data: event, error } = await supabase
    .from("conversion_events")
    .select("id, deal_id")
    .eq("id", conversionEventId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new AppError(
      "DATABASE_ERROR",
      "Falha ao consultar conversão para reenvio.",
      error,
    );
  }
  if (!event) {
    throw new AppError("NOT_FOUND", "Conversão não encontrada.");
  }

  await dispatchWonConversion({ organizationId, dealId: event.deal_id });
}
