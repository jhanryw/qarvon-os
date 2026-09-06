// @vitest-environment node
//
// Testa a orquestração da rota (status HTTP, wiring auth -> validação ->
// service -> dispatch), não a lógica interna de cada peça — essas já têm
// testes próprios (lib/integrations/leads/{auth,schema,service}.test.ts).
// resolveIntegrationCredential e createLeadFromIntegration são mockados;
// extractBearerToken e LeadIntakeError ficam reais (a rota depende do
// `instanceof LeadIntakeError` real para decidir o mapeamento de erro).
//
// `// @vitest-environment node`: mesma razão do teste de concorrência —
// evita jsdom (que define `window` globalmente) interferindo na construção
// de Request/Response reais e na avaliação de "server-only" via
// lib/supabase/admin.ts (mockado abaixo, mas o import ainda acontece).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

const { resolveIntegrationCredential } = vi.hoisted(() => ({
  resolveIntegrationCredential: vi.fn(),
}));
vi.mock("@/lib/integrations/leads/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/leads/auth")>(
    "@/lib/integrations/leads/auth",
  );
  return { ...actual, resolveIntegrationCredential };
});

const { createLeadFromIntegration } = vi.hoisted(() => ({
  createLeadFromIntegration: vi.fn(),
}));
vi.mock("@/lib/integrations/leads/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/leads/service")>(
    "@/lib/integrations/leads/service",
  );
  return { ...actual, createLeadFromIntegration };
});

const { dispatchDomainEvent } = vi.hoisted(() => ({ dispatchDomainEvent: vi.fn() }));
vi.mock("@/lib/events/dispatch", () => ({ dispatchDomainEvent }));

const { POST } = await import("@/app/api/integrations/leads/route");
const { LeadIntakeError } = await import("@/lib/integrations/leads/service");

const VALID_BODY = {
  external_submission_id: "sub-001",
  name: "Maria Teste",
  whatsapp: "(11) 91234-5678",
};

function request(options: { body?: unknown; auth?: string | null; rawBody?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.auth !== null) headers.authorization = options.auth ?? "Bearer valid-token";
  return new Request("http://localhost/api/integrations/leads", {
    method: "POST",
    headers,
    body: options.rawBody ?? JSON.stringify(options.body ?? VALID_BODY),
  });
}

beforeEach(() => {
  vi.stubEnv("INTEGRATION_TOKEN_PEPPER", "test-pepper");
  createAdminClient.mockReturnValue({});
  resolveIntegrationCredential.mockReset();
  createLeadFromIntegration.mockReset();
  dispatchDomainEvent.mockReset();
  dispatchDomainEvent.mockResolvedValue(undefined);
  resolveIntegrationCredential.mockResolvedValue({ id: "cred-1" });
  createLeadFromIntegration.mockResolvedValue({
    leadId: "lead-1",
    submissionId: "submission-1",
    isNewLead: true,
    duplicateSubmission: false,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/integrations/leads", () => {
  it("retorna 500 quando INTEGRATION_TOKEN_PEPPER não está configurado", async () => {
    vi.unstubAllEnvs();
    const response = await POST(request());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, error: "INTERNAL_ERROR" });
    expect(resolveIntegrationCredential).not.toHaveBeenCalled();
  });

  it("retorna 401 quando o header Authorization está ausente", async () => {
    const response = await POST(request({ auth: null }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, error: "UNAUTHORIZED" });
  });

  it("retorna 401 quando o header Authorization não usa o esquema Bearer", async () => {
    const response = await POST(request({ auth: "Basic abc123" }));
    expect(response.status).toBe(401);
  });

  it("retorna 401 quando o token não corresponde a nenhuma credencial ativa", async () => {
    resolveIntegrationCredential.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, error: "UNAUTHORIZED" });
    expect(createLeadFromIntegration).not.toHaveBeenCalled();
  });

  it("retorna 422 quando o corpo não é JSON válido", async () => {
    const response = await POST(request({ rawBody: "{not json" }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("retorna 422 com issues quando o payload falha a validação Zod", async () => {
    const response = await POST(request({ body: { name: "x" } }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, error: "VALIDATION_ERROR" });
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
    expect(createLeadFromIntegration).not.toHaveBeenCalled();
  });

  it("retorna 201 e dispara lead.created para um lead novo", async () => {
    createLeadFromIntegration.mockResolvedValue({
      leadId: "lead-1",
      submissionId: "submission-1",
      isNewLead: true,
      duplicateSubmission: false,
    });

    const response = await POST(request());
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      success: true,
      lead_id: "lead-1",
      submission_id: "submission-1",
      is_new_lead: true,
      duplicate_submission: false,
    });
    expect(dispatchDomainEvent).toHaveBeenCalledWith(
      "lead.created",
      expect.objectContaining({ leadId: "lead-1", submissionId: "submission-1" }),
    );
  });

  it("retorna 200 e dispara lead.returned para um lead que retorna", async () => {
    createLeadFromIntegration.mockResolvedValue({
      leadId: "lead-1",
      submissionId: "submission-2",
      isNewLead: false,
      duplicateSubmission: false,
    });

    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ success: true, is_new_lead: false });
    expect(dispatchDomainEvent).toHaveBeenCalledWith(
      "lead.returned",
      expect.anything(),
    );
  });

  it("retorna 200 (não 201) para um replay idempotente, mesmo com is_new_lead=true preservado", async () => {
    createLeadFromIntegration.mockResolvedValue({
      leadId: "lead-1",
      submissionId: "submission-1",
      isNewLead: true,
      duplicateSubmission: true,
    });

    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      is_new_lead: true,
      duplicate_submission: true,
    });
  });

  it("retorna 422 quando o service lança QARVON_INVALID_WHATSAPP", async () => {
    createLeadFromIntegration.mockRejectedValue(
      new LeadIntakeError("QARVON_INVALID_WHATSAPP"),
    );

    const response = await POST(request());
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, error: "VALIDATION_ERROR" });
    expect(dispatchDomainEvent).not.toHaveBeenCalled();
  });

  it("retorna 500 quando o service lança um erro inesperado (não QARVON_INVALID_WHATSAPP)", async () => {
    createLeadFromIntegration.mockRejectedValue(
      new LeadIntakeError("QARVON_INVALID_CREDENTIAL"),
    );

    const response = await POST(request());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, error: "INTERNAL_ERROR" });
    expect(dispatchDomainEvent).not.toHaveBeenCalled();
  });

  it("retorna 500 quando o service lança um erro que não é LeadIntakeError", async () => {
    createLeadFromIntegration.mockRejectedValue(new Error("boom"));

    const response = await POST(request());
    expect(response.status).toBe(500);
  });

  it("uma falha no dispatch de evento não impede a resposta de sucesso", async () => {
    dispatchDomainEvent.mockRejectedValue(new Error("telegram indisponível"));

    const response = await POST(request());
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
