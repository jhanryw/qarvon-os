import { createAdminClient } from "@/lib/supabase/admin";
import { sendMetaPurchaseEvent } from "@/lib/integrations/meta/capi";

// Disparo da conversão Meta para um deal específico — SEMPRE chamado DEPOIS
// que a transação de fechamento (close_lead_won) já commitou. Nunca lança:
// qualquer falha (Meta indisponível, integração não configurada, valor
// ausente) fica registrada em conversion_events, nunca propagada para quem
// chamou — o negócio já está GANHO independente do resultado deste envio.
//
// Idempotente por natureza: só processa um evento_events com status
// PENDING ou FAILED; um evento já SENT nunca é reenviado (evita duplicar
// Purchase por causa de retry/duplo clique/reprocessamento).
//
// createAdminClient() aqui é obrigatório e correto: meta_integrations e
// meta_integration_secrets são bloqueadas por RLS para "authenticated" de
// propósito. O token em si nunca é lido via .from() direto (nem o
// createAdminClient bypassa RLS o suficiente para isso fazer sentido
// arquiteturalmente) — a única forma de obter o valor decifrado é a RPC
// get_meta_access_token (grant só para service_role), que recebe a chave
// de cifragem do ambiente (META_TOKEN_ENCRYPTION_KEY) a cada chamada.
// Chave errada/ausente faz a RPC falhar alto (pgcrypto: "Wrong key or
// corrupt data") em vez de silenciosamente decifrar errado — tratado
// abaixo como falha de envio (FAILED), nunca como integração inativa.
//
// Sem "import \"server-only\"" próprio aqui de propósito: a proteção real
// já é transitiva via lib/supabase/admin.ts (que a tem) — repeti-la só
// impediria mockar createAdminClient em teste (server-only lança
// incondicionalmente fora do bundler do Next, que é quem resolve a
// condição "react-server") sem ganhar nenhuma segurança adicional (o
// bundler já barra este módulo em client code por causa dessa mesma
// dependência transitiva).
export async function dispatchWonConversion(params: {
  organizationId: string;
  dealId: string;
}): Promise<void> {
  const supabase = createAdminClient();

  const { data: integration } = await supabase
    .from("meta_integrations")
    .select("pixel_id, conversion_value_mode, active")
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  // Integração não configurada/ativa: nada a fazer. O evento fica PENDING
  // (criado por close_lead_won) até alguém configurar a Meta e reprocessar
  // — não é um erro, é o estado esperado enquanto a integração não existe.
  // Verificado ANTES de sequer tentar decifrar o token — evita uma
  // chamada de RPC desnecessária quando a integração nem está ativa.
  if (!integration?.active || !integration.pixel_id) {
    return;
  }

  const encryptionKey = process.env.META_TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) {
    console.error(
      "dispatchWonConversion: META_TOKEN_ENCRYPTION_KEY não configurado — não é possível decifrar o token da Meta",
    );
    return;
  }

  const { data: event } = await supabase
    .from("conversion_events")
    .select("id, status, attempts")
    .eq("deal_id", params.dealId)
    .eq("event_name", "Purchase")
    .maybeSingle();

  if (!event || event.status === "SENT") return;

  const { data: deal } = await supabase
    .from("deals")
    .select("lead_id, mrr, tcv, closed_at")
    .eq("id", params.dealId)
    .maybeSingle();
  if (!deal) return;

  const value = integration.conversion_value_mode === "MRR" ? deal.mrr : deal.tcv;
  if (value == null) {
    await supabase
      .from("conversion_events")
      .update({
        status: "FAILED",
        attempts: event.attempts + 1,
        last_error: `Valor de conversão (${integration.conversion_value_mode}) não disponível para este negócio.`,
      })
      .eq("id", event.id);
    return;
  }

  const { data: lead } = await supabase
    .from("leads")
    .select("whatsapp_normalized, email")
    .eq("id", deal.lead_id)
    .maybeSingle();

  const { data: submission } = await supabase
    .from("lead_submissions")
    .select("id")
    .eq("lead_id", deal.lead_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let fbc: string | null = null;
  let fbp: string | null = null;
  if (submission) {
    const { data: attribution } = await supabase
      .from("lead_attribution")
      .select("fbc, fbp")
      .eq("submission_id", submission.id)
      .maybeSingle();
    fbc = attribution?.fbc ?? null;
    fbp = attribution?.fbp ?? null;
  }

  const { data: accessToken, error: decryptError } = await supabase.rpc(
    "get_meta_access_token",
    { p_organization_id: params.organizationId, p_encryption_key: encryptionKey },
  );

  if (decryptError || !accessToken) {
    await supabase
      .from("conversion_events")
      .update({
        status: "FAILED",
        attempts: event.attempts + 1,
        last_error: decryptError?.message ?? "Token da Meta não configurado.",
      })
      .eq("id", event.id);
    return;
  }

  const result = await sendMetaPurchaseEvent({
    pixelId: integration.pixel_id,
    accessToken,
    eventId: event.id,
    eventTime: Math.floor(new Date(deal.closed_at).getTime() / 1000),
    value,
    currency: "BRL",
    phoneE164: lead?.whatsapp_normalized ?? null,
    email: lead?.email ?? null,
    fbc,
    fbp,
  });

  if (result.ok) {
    await supabase
      .from("conversion_events")
      .update({
        status: "SENT",
        sent_at: new Date().toISOString(),
        meta_event_id: result.metaEventId,
        attempts: event.attempts + 1,
      })
      .eq("id", event.id);
  } else {
    await supabase
      .from("conversion_events")
      .update({
        status: "FAILED",
        attempts: event.attempts + 1,
        last_error: result.error,
      })
      .eq("id", event.id);
  }
}
