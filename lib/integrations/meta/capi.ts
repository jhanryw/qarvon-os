import { createHash } from "node:crypto";

// Validado contra a documentação oficial da Meta (consultada via
// WebSearch/WebFetch em 2026-09-07 — developers.facebook.com/documentation/
// ads-commerce/conversions-api/{parameters,parameters/server-event,
// using-the-api} e confirmação cruzada em fontes secundárias estabelecidas
// quando a página oficial não carregou o conteúdo renderizado por JS).
// Pontos verificados e o que mudou em relação à primeira versão deste
// arquivo (que nunca tinha sido conferida contra a documentação real):
//
//   - endpoint: https://graph.facebook.com/{version}/{pixel_id}/events
//     ?access_token={token} — confirmado, sem mudança.
//   - versão: v25.0 é a estável mais recente confirmada por busca em
//     2026-09-07 (v26.0 esperada por volta de setembro/2026, ainda não
//     confirmada como estável no momento da pesquisa) — trocado de v21.0
//     (chute inicial, nunca validado) para v25.0.
//   - action_source: trocado de "other" para "system_generated". A
//     documentação oficial (Server Event Parameters) lista o enum completo
//     — website, email, app, phone_call, chat, physical_store,
//     system_generated, business_messaging, other — e recomenda
//     explicitamente "system_generated" para "internal business system
//     recordings (like CRM sales records)", que é exatamente este caso
//     (fechamento registrado no CRM, não uma ação do cliente num
//     website/app/telefone/chat/loja). "other" era o valor errado: é
//     definido como fallback só para quando NENHUM dos valores específicos
//     se aplica, e um deles claramente se aplica aqui.
//   - event_source_url: confirmado como exigido só para action_source
//     "website" — corretamente omitido aqui (não inventado).
//   - event_id: confirmado "opcional mas recomendado" para deduplicação
//     servidor/browser — mantido (usamos o id do conversion_event).
//   - user_data.ph: confirmado — hash SHA-256 de dígitos apenas, incluindo
//     código do país, SEM zero à esquerda. leads.whatsapp_normalized já
//     está em E.164 (+55 + DDD + número, sem zero à esquerda por
//     construção de _normalize_whatsapp_br) — só remover o "+" já produz
//     exatamente o formato exigido, sem normalização adicional necessária
//     para números brasileiros.
//   - user_data.em: adicionado (não existia na primeira versão) — e-mail
//     hasheado em SHA-256 (minúsculo, sem espaços), quando disponível
//     (leads.email é um campo de enriquecimento opcional) — melhora
//     qualidade de match sem custo, mesma família de user_data já usada.
//   - user_data.fbc/fbp: confirmado — NUNCA hasheados (iguais ao valor
//     original), diferente de ph/em.
//   - custom_data.value/currency: confirmado — obrigatórios para eventos
//     de compra, formato numérico simples + código de moeda (BRL).
//   - UTMs/campaign_id/adset_id/ad_id: confirmado que NÃO fazem parte do
//     schema de user_data/custom_data da Meta — nunca enviados, só usados
//     internamente (lead_attribution). Nenhuma mudança necessária aqui, a
//     implementação original já não os enviava.
//   - test_event_code: suportado como parâmetro opcional (campo no corpo,
//     ao lado de "data") — a documentação confirma que eventos com esse
//     código continuam contando para targeting/measurement (não é um
//     sandbox isolado), então só deve ser passado deliberadamente durante
//     homologação, nunca deixado ligado por padrão. Nenhum toggle de UI
//     para isso nesta entrega — só a capacidade de passar o parâmetro.
//   - Resposta de sucesso/erro: não confirmado com um exemplo literal de
//     resposta na pesquisa (uma tentativa de fetch de doc de terceiros
//     retornou 403) — mantido o formato já usado (sucesso:
//     {events_received, messages, fbtrace_id}; erro: {error: {message,
//     type, code, fbtrace_id}}), que é a convenção estável e universal da
//     Graph API (não específica da CAPI) — extractErrorMessage/
//     extractFbtraceId já degradam com segurança (nunca lançam) se o
//     formato realmente vier diferente do esperado.
const META_GRAPH_API_VERSION = "v25.0";

export interface MetaPurchaseEventInput {
  pixelId: string;
  accessToken: string;
  eventId: string;
  eventTime: number;
  value: number;
  currency: string;
  phoneE164: string | null;
  email: string | null;
  fbc: string | null;
  fbp: string | null;
  /** Só para homologação (Test Events, Events Manager) — nunca em produção. */
  testEventCode?: string;
}

export type MetaPurchaseEventResult =
  | { ok: true; metaEventId: string | null }
  | { ok: false; error: string };

// ph: dígitos apenas (com código do país, sem zero à esquerda — já
// garantido por _normalize_whatsapp_br para números BR) + SHA-256.
function hashPhoneForMeta(phoneE164: string): string {
  const digitsOnly = phoneE164.replace(/\D/g, "");
  return createHash("sha256").update(digitsOnly).digest("hex");
}

// em: minúsculo, sem espaços nas pontas, + SHA-256 — normalização mínima
// documentada pela Meta para o campo de e-mail.
function hashEmailForMeta(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}

function extractErrorMessage(payload: unknown, status: number): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof (payload.error as { message?: unknown }).message === "string"
  ) {
    return (payload.error as { message: string }).message;
  }
  return `Meta CAPI respondeu HTTP ${status}`;
}

function extractFbtraceId(payload: unknown): string | null {
  if (
    payload &&
    typeof payload === "object" &&
    "fbtrace_id" in payload &&
    typeof (payload as { fbtrace_id?: unknown }).fbtrace_id === "string"
  ) {
    return (payload as { fbtrace_id: string }).fbtrace_id;
  }
  return null;
}

// Envia um evento "Purchase" server-side (Conversions API) — nunca depende
// do Pixel do browser para uma venda fechada dentro do CRM. UTMs/campaign
// ids NÃO são enviados: não fazem parte do esquema de user_data/matching da
// Meta, só da nossa atribuição interna (lead_attribution).
export async function sendMetaPurchaseEvent(
  input: MetaPurchaseEventInput,
): Promise<MetaPurchaseEventResult> {
  const userData: Record<string, unknown> = {};
  if (input.phoneE164) {
    userData.ph = [hashPhoneForMeta(input.phoneE164)];
  }
  if (input.email) {
    userData.em = [hashEmailForMeta(input.email)];
  }
  if (input.fbc) userData.fbc = input.fbc;
  if (input.fbp) userData.fbp = input.fbp;

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: "Purchase",
        event_time: input.eventTime,
        event_id: input.eventId,
        action_source: "system_generated",
        user_data: userData,
        custom_data: {
          value: input.value,
          currency: input.currency,
        },
      },
    ],
  };
  if (input.testEventCode) {
    body.test_event_code = input.testEventCode;
  }

  const url =
    `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${encodeURIComponent(input.pixelId)}/events` +
    `?access_token=${encodeURIComponent(input.accessToken)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Falha de rede ao chamar a Meta CAPI",
    };
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    return { ok: false, error: extractErrorMessage(payload, response.status) };
  }

  return { ok: true, metaEventId: extractFbtraceId(payload) };
}
