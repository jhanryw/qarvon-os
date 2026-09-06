import { describe, expect, it } from "vitest";
import {
  computeIntegrationTokenHash,
  extractBearerToken,
  resolveIntegrationCredential,
  type CredentialLookupClient,
} from "@/lib/integrations/leads/auth";

describe("extractBearerToken", () => {
  it("extrai o token de um header Authorization válido", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("é case-insensitive no prefixo Bearer", () => {
    expect(extractBearerToken("bearer abc123")).toBe("abc123");
  });

  it("aceita múltiplos espaços entre Bearer e o token", () => {
    expect(extractBearerToken("Bearer    abc123")).toBe("abc123");
  });

  it("retorna null para header ausente", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it("retorna null para header vazio", () => {
    expect(extractBearerToken("")).toBeNull();
  });

  it("retorna null quando não tem o prefixo Bearer", () => {
    expect(extractBearerToken("abc123")).toBeNull();
  });

  it("retorna null para 'Bearer' sem token", () => {
    expect(extractBearerToken("Bearer")).toBeNull();
    expect(extractBearerToken("Bearer   ")).toBeNull();
  });

  it("retorna null para outro esquema de autenticação (Basic)", () => {
    expect(extractBearerToken("Basic dXNlcjpwYXNz")).toBeNull();
  });
});

describe("computeIntegrationTokenHash", () => {
  it("é determinístico: mesmo token + mesmo pepper => mesmo hash", () => {
    const a = computeIntegrationTokenHash("token-1", "pepper-1");
    const b = computeIntegrationTokenHash("token-1", "pepper-1");
    expect(a).toBe(b);
  });

  it("tokens diferentes com o mesmo pepper produzem hashes diferentes", () => {
    const a = computeIntegrationTokenHash("token-1", "pepper-1");
    const b = computeIntegrationTokenHash("token-2", "pepper-1");
    expect(a).not.toBe(b);
  });

  it("o mesmo token com peppers diferentes produz hashes diferentes", () => {
    const a = computeIntegrationTokenHash("token-1", "pepper-1");
    const b = computeIntegrationTokenHash("token-1", "pepper-2");
    expect(a).not.toBe(b);
  });

  it("produz um hex de 64 caracteres (SHA-256)", () => {
    const hash = computeIntegrationTokenHash("token-1", "pepper-1");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

function fakeCredentialClient(
  response: { data: { id: string; active: boolean } | null; error: unknown },
): CredentialLookupClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => response,
        }),
      }),
    }),
  };
}

describe("resolveIntegrationCredential", () => {
  it("retorna a credencial quando encontrada e ativa", async () => {
    const client = fakeCredentialClient({
      data: { id: "cred-1", active: true },
      error: null,
    });
    const result = await resolveIntegrationCredential(client, "token", "pepper");
    expect(result).toEqual({ id: "cred-1" });
  });

  it("retorna null quando a credencial não é encontrada", async () => {
    const client = fakeCredentialClient({ data: null, error: null });
    const result = await resolveIntegrationCredential(client, "token", "pepper");
    expect(result).toBeNull();
  });

  it("retorna null quando a credencial existe mas está inativa", async () => {
    const client = fakeCredentialClient({
      data: { id: "cred-1", active: false },
      error: null,
    });
    const result = await resolveIntegrationCredential(client, "token", "pepper");
    expect(result).toBeNull();
  });

  it("retorna null (não lança) quando a consulta ao banco falha", async () => {
    const client = fakeCredentialClient({
      data: null,
      error: { message: "connection refused" },
    });
    const result = await resolveIntegrationCredential(client, "token", "pepper");
    expect(result).toBeNull();
  });
});
