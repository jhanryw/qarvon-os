// @vitest-environment node
//
// node (não jsdom): dispatch.ts importa (transitivamente, via
// lib/supabase/admin.ts) "server-only", que lança quando `window` existe
// globalmente — jsdom define isso, node não. admin.ts é mockado abaixo de
// qualquer forma, mas o ambiente node evita qualquer dependência disso.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

const { sendMetaPurchaseEvent } = vi.hoisted(() => ({ sendMetaPurchaseEvent: vi.fn() }));
vi.mock("@/lib/integrations/meta/capi", () => ({ sendMetaPurchaseEvent }));

const { dispatchWonConversion } = await import("@/lib/integrations/meta/dispatch");

type Row = Record<string, unknown> | null;
type RpcResponse = { data: unknown; error: { message: string } | null };

// Fake keyed por tabela: cada .from(table).select(...).maybeSingle() consome
// a próxima resposta da fila daquela tabela, na ordem em que
// dispatchWonConversion realmente as consulta. .update() só registra a
// chamada (dispatch.ts nunca lê o retorno de um update). .rpc() é usado só
// para get_meta_access_token — o token nunca mais vem de uma coluna de
// meta_integrations (ver migration 20260907100230/20260907100320: o
// access_token foi movido para meta_integration_secrets, cifrado, só
// legível via essa RPC service_role-only).
function fakeAdminClient(responses: Record<string, Row[]>, rpcResponse?: RpcResponse) {
  const updateCalls: { table: string; payload: Record<string, unknown> }[] = [];
  const rpcCalls: { fn: string; args: unknown }[] = [];
  const cursors: Record<string, number> = {};

  function nextFor(table: string): { data: Row; error: null } {
    const idx = cursors[table] ?? 0;
    cursors[table] = idx + 1;
    const queue = responses[table] ?? [];
    return { data: queue[idx] ?? null, error: null };
  }

  function from(table: string) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve(nextFor(table)),
      update: (payload: Record<string, unknown>) => {
        updateCalls.push({ table, payload });
        return chain;
      },
    };
    return chain;
  }

  function rpc(fn: string, args: unknown) {
    rpcCalls.push({ fn, args });
    return Promise.resolve(rpcResponse ?? { data: "decrypted-token", error: null });
  }

  return { client: { from, rpc }, updateCalls, rpcCalls };
}

const ORG_ID = "org-1";
const DEAL_ID = "deal-1";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("META_TOKEN_ENCRYPTION_KEY", "test-encryption-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dispatchWonConversion", () => {
  it("não faz nada quando a integração não está ativa (evento fica PENDING)", async () => {
    const fake = fakeAdminClient({
      meta_integrations: [{ pixel_id: "123", conversion_value_mode: "TCV", active: false }],
    });
    createAdminClient.mockReturnValue(fake.client);

    await dispatchWonConversion({ organizationId: ORG_ID, dealId: DEAL_ID });

    expect(sendMetaPurchaseEvent).not.toHaveBeenCalled();
    expect(fake.updateCalls).toHaveLength(0);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("não faz nada quando não há meta_integrations configurada", async () => {
    const fake = fakeAdminClient({ meta_integrations: [null] });
    createAdminClient.mockReturnValue(fake.client);

    await dispatchWonConversion({ organizationId: ORG_ID, dealId: DEAL_ID });

    expect(sendMetaPurchaseEvent).not.toHaveBeenCalled();
  });

  it("idempotência: nunca reenvia um evento já SENT", async () => {
    const fake = fakeAdminClient({
      meta_integrations: [{ pixel_id: "123", conversion_value_mode: "TCV", active: true }],
      conversion_events: [{ id: "event-1", status: "SENT", attempts: 1 }],
    });
    createAdminClient.mockReturnValue(fake.client);

    await dispatchWonConversion({ organizationId: ORG_ID, dealId: DEAL_ID });

    expect(sendMetaPurchaseEvent).not.toHaveBeenCalled();
    expect(fake.updateCalls).toHaveLength(0);
  });

  it("marca FAILED quando o valor de conversão configurado (MRR) não está disponível no deal (nunca chega a decifrar o token)", async () => {
    const fake = fakeAdminClient({
      meta_integrations: [{ pixel_id: "123", conversion_value_mode: "MRR", active: true }],
      conversion_events: [{ id: "event-1", status: "PENDING", attempts: 0 }],
      deals: [{ lead_id: "lead-1", mrr: null, tcv: 15000, closed_at: "2026-01-01T00:00:00.000Z" }],
    });
    createAdminClient.mockReturnValue(fake.client);

    await dispatchWonConversion({ organizationId: ORG_ID, dealId: DEAL_ID });

    expect(sendMetaPurchaseEvent).not.toHaveBeenCalled();
    expect(fake.rpcCalls).toHaveLength(0);
    expect(fake.updateCalls).toHaveLength(1);
    expect(fake.updateCalls[0].payload).toMatchObject({ status: "FAILED", attempts: 1 });
  });

  it("não faz nada e loga quando META_TOKEN_ENCRYPTION_KEY não está configurado", async () => {
    vi.unstubAllEnvs();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const fake = fakeAdminClient({
      meta_integrations: [{ pixel_id: "123", conversion_value_mode: "TCV", active: true }],
    });
    createAdminClient.mockReturnValue(fake.client);

    await dispatchWonConversion({ organizationId: ORG_ID, dealId: DEAL_ID });

    expect(sendMetaPurchaseEvent).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("marca FAILED quando get_meta_access_token falha (chave de cifragem errada/dado corrompido)", async () => {
    const fake = fakeAdminClient(
      {
        meta_integrations: [{ pixel_id: "123", conversion_value_mode: "TCV", active: true }],
        conversion_events: [{ id: "event-1", status: "PENDING", attempts: 0 }],
        deals: [{ lead_id: "lead-1", mrr: null, tcv: 15000, closed_at: "2026-01-01T00:00:00.000Z" }],
        leads: [{ whatsapp_normalized: null }],
        lead_submissions: [null],
      },
      { data: null, error: { message: "Wrong key or corrupt data" } },
    );
    createAdminClient.mockReturnValue(fake.client);

    await dispatchWonConversion({ organizationId: ORG_ID, dealId: DEAL_ID });

    expect(sendMetaPurchaseEvent).not.toHaveBeenCalled();
    const update = fake.updateCalls.find((call) => call.table === "conversion_events");
    expect(update?.payload).toMatchObject({ status: "FAILED", last_error: "Wrong key or corrupt data" });
  });

  it("caminho de sucesso: decifra o token via RPC, envia Purchase com o valor no modo configurado e marca SENT", async () => {
    sendMetaPurchaseEvent.mockResolvedValue({ ok: true, metaEventId: "trace-1" });

    const fake = fakeAdminClient(
      {
        meta_integrations: [{ pixel_id: "123", conversion_value_mode: "TCV", active: true }],
        conversion_events: [{ id: "event-1", status: "PENDING", attempts: 0 }],
        deals: [{ lead_id: "lead-1", mrr: 2500, tcv: 15000, closed_at: "2026-01-01T00:00:00.000Z" }],
        leads: [{ whatsapp_normalized: "+5511999999999" }],
        lead_submissions: [{ id: "submission-1" }],
        lead_attribution: [{ fbc: "fb.1.aaa", fbp: "fb.1.bbb" }],
      },
      { data: "tok-decifrado", error: null },
    );
    createAdminClient.mockReturnValue(fake.client);

    await dispatchWonConversion({ organizationId: ORG_ID, dealId: DEAL_ID });

    expect(fake.rpcCalls[0]).toMatchObject({
      fn: "get_meta_access_token",
      args: { p_organization_id: ORG_ID, p_encryption_key: "test-encryption-key" },
    });
    expect(sendMetaPurchaseEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        pixelId: "123",
        accessToken: "tok-decifrado",
        eventId: "event-1",
        value: 15000,
        currency: "BRL",
        phoneE164: "+5511999999999",
        fbc: "fb.1.aaa",
        fbp: "fb.1.bbb",
      }),
    );

    const update = fake.updateCalls.find((call) => call.table === "conversion_events");
    expect(update?.payload).toMatchObject({ status: "SENT", meta_event_id: "trace-1", attempts: 1 });
  });

  it("caminho de falha: marca FAILED com last_error e incrementa attempts, sem lançar", async () => {
    sendMetaPurchaseEvent.mockResolvedValue({ ok: false, error: "Invalid access token" });

    const fake = fakeAdminClient({
      meta_integrations: [{ pixel_id: "123", conversion_value_mode: "TCV", active: true }],
      conversion_events: [{ id: "event-1", status: "FAILED", attempts: 2 }],
      deals: [{ lead_id: "lead-1", mrr: null, tcv: 15000, closed_at: "2026-01-01T00:00:00.000Z" }],
      leads: [{ whatsapp_normalized: null }],
      lead_submissions: [null],
    });
    createAdminClient.mockReturnValue(fake.client);

    await expect(
      dispatchWonConversion({ organizationId: ORG_ID, dealId: DEAL_ID }),
    ).resolves.toBeUndefined();

    const update = fake.updateCalls.find((call) => call.table === "conversion_events");
    expect(update?.payload).toMatchObject({
      status: "FAILED",
      last_error: "Invalid access token",
      attempts: 3,
    });
  });

  it("retry de um evento FAILED reprocessa normalmente (não é bloqueado como o SENT)", async () => {
    sendMetaPurchaseEvent.mockResolvedValue({ ok: true, metaEventId: null });

    const fake = fakeAdminClient({
      meta_integrations: [{ pixel_id: "123", conversion_value_mode: "TCV", active: true }],
      conversion_events: [{ id: "event-1", status: "FAILED", attempts: 1 }],
      deals: [{ lead_id: "lead-1", mrr: null, tcv: 15000, closed_at: "2026-01-01T00:00:00.000Z" }],
      leads: [{ whatsapp_normalized: null }],
      lead_submissions: [null],
    });
    createAdminClient.mockReturnValue(fake.client);

    await dispatchWonConversion({ organizationId: ORG_ID, dealId: DEAL_ID });

    expect(sendMetaPurchaseEvent).toHaveBeenCalledTimes(1);
    const update = fake.updateCalls.find((call) => call.table === "conversion_events");
    expect(update?.payload).toMatchObject({ status: "SENT" });
  });
});
