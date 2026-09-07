import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { getTenantContext } = vi.hoisted(() => ({ getTenantContext: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getTenantContext }));

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { dispatchWonConversion } = vi.hoisted(() => ({ dispatchWonConversion: vi.fn() }));
vi.mock("@/lib/integrations/meta/dispatch", () => ({ dispatchWonConversion }));

const { upsertMetaIntegrationSettings, retryConversionEvent } = await import(
  "@/lib/integrations/meta/mutations"
);

function fakeSupabaseRpc(rpcResponse: { data: unknown; error: unknown }) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    client: {
      rpc: (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return Promise.resolve(rpcResponse);
      },
    },
    calls,
  };
}

function fakeSupabaseFrom(response: { data: unknown; error: unknown }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve(response),
  };
  return { client: { from: () => chain } };
}

beforeEach(() => {
  vi.clearAllMocks();
  getTenantContext.mockResolvedValue({ organizationId: "org-1" });
  vi.stubEnv("META_TOKEN_ENCRYPTION_KEY", "test-encryption-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("upsertMetaIntegrationSettings", () => {
  it("chama upsert_meta_integration com os parâmetros mapeados (incluindo a chave de cifragem) e nunca expõe o token de volta", async () => {
    const fake = fakeSupabaseRpc({
      data: [{ pixel_id: "123", conversion_value_mode: "TCV", active: true, has_access_token: true }],
      error: null,
    });
    createClient.mockResolvedValue(fake.client);

    const result = await upsertMetaIntegrationSettings({
      pixelId: "123",
      accessToken: "novo-token",
      conversionValueMode: "TCV",
      active: true,
    });

    expect(result).toEqual({
      pixelId: "123",
      conversionValueMode: "TCV",
      active: true,
      hasAccessToken: true,
    });
    expect(result).not.toHaveProperty("accessToken");
    expect(fake.calls[0]).toMatchObject({
      fn: "upsert_meta_integration",
      args: {
        p_pixel_id: "123",
        p_access_token: "novo-token",
        p_encryption_key: "test-encryption-key",
      },
    });
  });

  it("não exige META_TOKEN_ENCRYPTION_KEY quando nenhum token novo está sendo enviado", async () => {
    vi.unstubAllEnvs();
    const fake = fakeSupabaseRpc({
      data: [{ pixel_id: "123", conversion_value_mode: "TCV", active: true, has_access_token: true }],
      error: null,
    });
    createClient.mockResolvedValue(fake.client);

    await expect(upsertMetaIntegrationSettings({ pixelId: "123" })).resolves.toMatchObject({
      pixelId: "123",
    });
    expect(fake.calls[0]).toMatchObject({ args: { p_access_token: null, p_encryption_key: null } });
  });

  it("lança quando um token novo é enviado mas META_TOKEN_ENCRYPTION_KEY não está configurado", async () => {
    vi.unstubAllEnvs();
    await expect(
      upsertMetaIntegrationSettings({ accessToken: "novo-token" }),
    ).rejects.toMatchObject({ code: "DATABASE_ERROR" });
  });

  it("mapeia NO_ACCESS (não-admin) para AppError", async () => {
    const fake = fakeSupabaseRpc({ data: null, error: { message: "QARVON_NO_ACCESS" } });
    createClient.mockResolvedValue(fake.client);

    await expect(upsertMetaIntegrationSettings({})).rejects.toMatchObject({ code: "NO_ACCESS" });
  });

  it("mapeia QARVON_META_CREDENTIALS_REQUIRED (ativar sem pixel/token) como erro de validação", async () => {
    const fake = fakeSupabaseRpc({
      data: null,
      error: { message: "QARVON_META_CREDENTIALS_REQUIRED" },
    });
    createClient.mockResolvedValue(fake.client);

    await expect(upsertMetaIntegrationSettings({ active: true })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});

describe("retryConversionEvent", () => {
  it("resolve o deal_id do evento (escopado à organização via RLS) e delega para dispatchWonConversion", async () => {
    const fake = fakeSupabaseFrom({ data: { id: "event-1", deal_id: "deal-1" }, error: null });
    createClient.mockResolvedValue(fake.client);
    dispatchWonConversion.mockResolvedValue(undefined);

    await retryConversionEvent("event-1");

    expect(dispatchWonConversion).toHaveBeenCalledWith({ organizationId: "org-1", dealId: "deal-1" });
  });

  it("lança NOT_FOUND quando o evento não existe (ou não pertence à organização do usuário)", async () => {
    const fake = fakeSupabaseFrom({ data: null, error: null });
    createClient.mockResolvedValue(fake.client);

    await expect(retryConversionEvent("event-inexistente")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(dispatchWonConversion).not.toHaveBeenCalled();
  });

  it("propaga erro real de banco como DATABASE_ERROR", async () => {
    const fake = fakeSupabaseFrom({ data: null, error: { message: "connection refused" } });
    createClient.mockResolvedValue(fake.client);

    await expect(retryConversionEvent("event-1")).rejects.toMatchObject({ code: "DATABASE_ERROR" });
  });
});

