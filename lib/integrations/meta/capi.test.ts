import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { sendMetaPurchaseEvent } from "@/lib/integrations/meta/capi";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("sendMetaPurchaseEvent", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envia Purchase com action_source system_generated (validado contra a documentação oficial: recomendado para vendas registradas no CRM)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { events_received: 1, fbtrace_id: "trace-123" }));

    const result = await sendMetaPurchaseEvent({
      pixelId: "123456",
      accessToken: "token-abc",
      eventId: "event-1",
      eventTime: 1700000000,
      value: 15000,
      currency: "BRL",
      phoneE164: "+5511999999999",
      email: null,
      fbc: "fb.1.111.aaa",
      fbp: "fb.1.222.bbb",
    });

    expect(result).toEqual({ ok: true, metaEventId: "trace-123" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/123456/events");
    expect(String(url)).toContain("access_token=token-abc");
    expect(String(url)).toContain("/v25.0/");

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.data[0]).toMatchObject({
      event_name: "Purchase",
      event_time: 1700000000,
      event_id: "event-1",
      action_source: "system_generated",
      custom_data: { value: 15000, currency: "BRL" },
    });
    // event_source_url só é exigido pela Meta para action_source "website"
    // — nunca inventado aqui.
    expect(body.data[0]).not.toHaveProperty("event_source_url");
  });

  it("hasheia o telefone em SHA-256 (dígitos apenas, sem o '+', com código do país) antes de enviar", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await sendMetaPurchaseEvent({
      pixelId: "123456",
      accessToken: "token-abc",
      eventId: "event-1",
      eventTime: 1700000000,
      value: 100,
      currency: "BRL",
      phoneE164: "+5511999999999",
      email: null,
      fbc: null,
      fbp: null,
    });

    const expectedHash = createHash("sha256").update("5511999999999").digest("hex");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.data[0].user_data.ph).toEqual([expectedHash]);
  });

  it("hasheia o e-mail em SHA-256 (minúsculo, sem espaços) quando disponível", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await sendMetaPurchaseEvent({
      pixelId: "123456",
      accessToken: "token-abc",
      eventId: "event-1",
      eventTime: 1700000000,
      value: 100,
      currency: "BRL",
      phoneE164: null,
      email: "  Cliente@Exemplo.COM  ",
      fbc: null,
      fbp: null,
    });

    const expectedHash = createHash("sha256").update("cliente@exemplo.com").digest("hex");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.data[0].user_data.em).toEqual([expectedHash]);
  });

  it("NÃO envia UTMs/campaign ids — só user_data e custom_data de valor/moeda (confirmado: não fazem parte do schema da Meta)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await sendMetaPurchaseEvent({
      pixelId: "123456",
      accessToken: "token-abc",
      eventId: "event-1",
      eventTime: 1700000000,
      value: 100,
      currency: "BRL",
      phoneE164: null,
      email: null,
      fbc: "fb.1.111.aaa",
      fbp: null,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.data[0]).not.toHaveProperty("utm_source");
    expect(body.data[0].custom_data).toEqual({ value: 100, currency: "BRL" });
    expect(body.data[0].user_data).toEqual({ fbc: "fb.1.111.aaa" });
  });

  it("fbc/fbp nunca são hasheados (vão como recebidos, diferente de ph/em)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await sendMetaPurchaseEvent({
      pixelId: "123456",
      accessToken: "token-abc",
      eventId: "event-1",
      eventTime: 1700000000,
      value: 100,
      currency: "BRL",
      phoneE164: null,
      email: null,
      fbc: "fb.1.111.aaa",
      fbp: "fb.1.222.bbb",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.data[0].user_data.fbc).toBe("fb.1.111.aaa");
    expect(body.data[0].user_data.fbp).toBe("fb.1.222.bbb");
  });

  it("omite ph/em/fbc/fbp quando não disponíveis, sem quebrar o payload", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await sendMetaPurchaseEvent({
      pixelId: "123456",
      accessToken: "token-abc",
      eventId: "event-1",
      eventTime: 1700000000,
      value: 100,
      currency: "BRL",
      phoneE164: null,
      email: null,
      fbc: null,
      fbp: null,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.data[0].user_data).toEqual({});
  });

  it("inclui test_event_code no corpo só quando explicitamente informado (homologação)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await sendMetaPurchaseEvent({
      pixelId: "123456",
      accessToken: "token-abc",
      eventId: "event-1",
      eventTime: 1700000000,
      value: 100,
      currency: "BRL",
      phoneE164: null,
      email: null,
      fbc: null,
      fbp: null,
      testEventCode: "TEST12345",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.test_event_code).toBe("TEST12345");
  });

  it("não inclui test_event_code quando omitido (produção)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await sendMetaPurchaseEvent({
      pixelId: "123456",
      accessToken: "token-abc",
      eventId: "event-1",
      eventTime: 1700000000,
      value: 100,
      currency: "BRL",
      phoneE164: null,
      email: null,
      fbc: null,
      fbp: null,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).not.toHaveProperty("test_event_code");
  });

  it("retorna ok=false com a mensagem de erro da Meta quando a resposta HTTP não é ok", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: { message: "Invalid parameter", type: "OAuthException" } }),
    );

    const result = await sendMetaPurchaseEvent({
      pixelId: "123456",
      accessToken: "token-invalido",
      eventId: "event-1",
      eventTime: 1700000000,
      value: 100,
      currency: "BRL",
      phoneE164: null,
      email: null,
      fbc: null,
      fbp: null,
    });

    expect(result).toEqual({ ok: false, error: "Invalid parameter" });
  });

  it("retorna ok=false em caso de falha de rede, sem lançar exceção", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await sendMetaPurchaseEvent({
      pixelId: "123456",
      accessToken: "token-abc",
      eventId: "event-1",
      eventTime: 1700000000,
      value: 100,
      currency: "BRL",
      phoneE164: null,
      email: null,
      fbc: null,
      fbp: null,
    });

    expect(result).toEqual({ ok: false, error: "network down" });
  });
});
