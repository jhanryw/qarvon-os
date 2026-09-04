import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";
import { AppError } from "@/lib/errors";

const { createLead, updateLead } = vi.hoisted(() => ({
  createLead: vi.fn(),
  updateLead: vi.fn(),
}));
vi.mock("@/lib/leads/mutations", () => ({ createLead, updateLead }));

const { getLeadById, listLeadSources } = vi.hoisted(() => ({
  getLeadById: vi.fn(),
  listLeadSources: vi.fn(),
}));
vi.mock("@/lib/leads/queries", () => ({ getLeadById, listLeadSources }));

const { listOrganizationProfiles } = vi.hoisted(() => ({
  listOrganizationProfiles: vi.fn(),
}));
vi.mock("@/lib/profiles/queries", () => ({ listOrganizationProfiles }));

const { createLeadAction, updateLeadAction, loadLeadForEditAction } =
  await import("@/lib/leads/actions");

function formDataFrom(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

beforeEach(() => {
  createLead.mockReset();
  updateLead.mockReset();
  getLeadById.mockReset();
  listLeadSources.mockReset();
  listOrganizationProfiles.mockReset();
});

describe("createLeadAction", () => {
  it("retorna sucesso quando createLead resolve", async () => {
    createLead.mockResolvedValue({ id: "lead-1" });

    const result = await createLeadAction(
      { status: "idle" },
      formDataFrom({ name: "Lead Teste" }),
    );

    expect(result.status).toBe("success");
  });

  it("nunca envia campos técnicos para a mutation, mesmo se presentes no FormData", async () => {
    createLead.mockResolvedValue({ id: "lead-1" });

    await createLeadAction(
      { status: "idle" },
      formDataFrom({
        name: "Lead Teste",
        id: "algum-id",
        organization_id: "outra-org",
      }),
    );

    const receivedInput = createLead.mock.calls[0]?.[0];
    expect(receivedInput).not.toHaveProperty("id");
    expect(receivedInput).not.toHaveProperty("organization_id");
  });

  it("mapeia DUPLICATE_WHATSAPP para mensagem amigável", async () => {
    createLead.mockRejectedValue(
      new AppError("DUPLICATE_WHATSAPP", "detalhe interno"),
    );

    const result = await createLeadAction(
      { status: "idle" },
      formDataFrom({ name: "Lead Teste" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toBe("Já existe outro lead com este WhatsApp.");
  });

  it("mapeia INVALID_OWNER para mensagem amigável", async () => {
    createLead.mockRejectedValue(new AppError("INVALID_OWNER", "detalhe"));

    const result = await createLeadAction(
      { status: "idle" },
      formDataFrom({ name: "Lead Teste" }),
    );

    expect(result.message).toBe(
      "O responsável selecionado não está disponível.",
    );
  });

  it("mapeia INVALID_LEAD_SOURCE para mensagem amigável", async () => {
    createLead.mockRejectedValue(
      new AppError("INVALID_LEAD_SOURCE", "detalhe"),
    );

    const result = await createLeadAction(
      { status: "idle" },
      formDataFrom({ name: "Lead Teste" }),
    );

    expect(result.message).toBe("A origem selecionada não está disponível.");
  });

  it("mapeia AppError VALIDATION_ERROR para mensagem genérica segura", async () => {
    createLead.mockRejectedValue(
      new AppError("VALIDATION_ERROR", "detalhe interno de FK"),
    );

    const result = await createLeadAction(
      { status: "idle" },
      formDataFrom({ name: "Lead Teste" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toBe("Verifique os dados informados.");
  });

  it("mapeia erro de validação de schema (ZodError) para fieldErrors, sem vazar detalhe interno", async () => {
    const zodError = new z.ZodError([
      {
        code: "custom",
        message: "Nome é obrigatório",
        path: ["name"],
      },
    ]);
    createLead.mockRejectedValue(zodError);

    const result = await createLeadAction(
      { status: "idle" },
      formDataFrom({ name: "Lead Teste" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.name).toBe("Nome é obrigatório");
    expect(JSON.stringify(result)).not.toContain("ZodError");
  });

  it("DATABASE_ERROR nunca expõe cause/SQL cru ao retorno", async () => {
    createLead.mockRejectedValue(
      new AppError("DATABASE_ERROR", "detalhe", {
        message: "syntax error at or near SELECT",
        code: "42601",
      }),
    );

    const result = await createLeadAction(
      { status: "idle" },
      formDataFrom({ name: "Lead Teste" }),
    );

    expect(result.message).toBe(
      "Não foi possível salvar o lead. Tente novamente.",
    );
    expect(JSON.stringify(result)).not.toContain("syntax error");
  });

  it("erro totalmente inesperado retorna mensagem genérica, sem vazar detalhe", async () => {
    createLead.mockRejectedValue(new Error("connection reset by peer"));

    const result = await createLeadAction(
      { status: "idle" },
      formDataFrom({ name: "Lead Teste" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toBe(
      "Não foi possível salvar o lead. Tente novamente.",
    );
    expect(JSON.stringify(result)).not.toContain("connection reset");
  });
});

const EXISTING_LEAD = {
  id: "lead-1",
  organization_id: "org-1",
  name: "Lead Atual",
  lead_source_id: "22222222-2222-4222-8222-222222222222",
  owner_id: null,
};

describe("updateLeadAction", () => {
  it("retorna sucesso quando updateLead resolve", async () => {
    getLeadById.mockResolvedValue(EXISTING_LEAD);
    updateLead.mockResolvedValue({ id: "lead-1" });

    const result = await updateLeadAction(
      "lead-1",
      { status: "idle" },
      formDataFrom({ name: "Novo Nome" }),
    );

    expect(result.status).toBe("success");
  });

  it("NOT_FOUND (lead inexistente ou de outro tenant) mapeia para mensagem correta", async () => {
    getLeadById.mockRejectedValue(new AppError("NOT_FOUND", "detalhe"));

    const result = await updateLeadAction(
      "lead-inexistente",
      { status: "idle" },
      formDataFrom({ name: "Novo Nome" }),
    );

    expect(result.status).toBe("error");
    expect(result.message).toBe("Lead não encontrado.");
    expect(updateLead).not.toHaveBeenCalled();
  });

  it("mapeia DUPLICATE_WHATSAPP para mensagem amigável", async () => {
    getLeadById.mockResolvedValue(EXISTING_LEAD);
    updateLead.mockRejectedValue(
      new AppError("DUPLICATE_WHATSAPP", "detalhe"),
    );

    const result = await updateLeadAction(
      "lead-1",
      { status: "idle" },
      formDataFrom({ name: "Novo Nome", whatsapp: "84999999999" }),
    );

    expect(result.message).toBe("Já existe outro lead com este WhatsApp.");
  });

  it("mapeia INVALID_OWNER para mensagem amigável", async () => {
    getLeadById.mockResolvedValue(EXISTING_LEAD);
    updateLead.mockRejectedValue(new AppError("INVALID_OWNER", "detalhe"));

    const result = await updateLeadAction(
      "lead-1",
      { status: "idle" },
      formDataFrom({ name: "Novo Nome" }),
    );

    expect(result.message).toBe(
      "O responsável selecionado não está disponível.",
    );
  });

  it("mapeia INVALID_LEAD_SOURCE para mensagem amigável", async () => {
    getLeadById.mockResolvedValue(EXISTING_LEAD);
    updateLead.mockRejectedValue(
      new AppError("INVALID_LEAD_SOURCE", "detalhe"),
    );

    const result = await updateLeadAction(
      "lead-1",
      { status: "idle" },
      formDataFrom({ name: "Novo Nome" }),
    );

    expect(result.message).toBe("A origem selecionada não está disponível.");
  });

  it("mapeia VALIDATION_ERROR para mensagem genérica segura", async () => {
    getLeadById.mockResolvedValue(EXISTING_LEAD);
    updateLead.mockRejectedValue(
      new AppError("VALIDATION_ERROR", "detalhe interno de FK"),
    );

    const result = await updateLeadAction(
      "lead-1",
      { status: "idle" },
      formDataFrom({ name: "Novo Nome" }),
    );

    expect(result.message).toBe("Verifique os dados informados.");
  });

  it("DATABASE_ERROR nunca expõe cause/SQL cru ao retorno", async () => {
    getLeadById.mockResolvedValue(EXISTING_LEAD);
    updateLead.mockRejectedValue(
      new AppError("DATABASE_ERROR", "detalhe", {
        message: "syntax error at or near SELECT",
      }),
    );

    const result = await updateLeadAction(
      "lead-1",
      { status: "idle" },
      formDataFrom({ name: "Novo Nome" }),
    );

    expect(result.message).toBe(
      "Não foi possível salvar o lead. Tente novamente.",
    );
    expect(JSON.stringify(result)).not.toContain("syntax error");
  });

  it("nunca envia campos técnicos para a mutation, mesmo se presentes no FormData", async () => {
    getLeadById.mockResolvedValue(EXISTING_LEAD);
    updateLead.mockResolvedValue({ id: "lead-1" });

    await updateLeadAction(
      "lead-1",
      { status: "idle" },
      formDataFrom({
        name: "Novo Nome",
        id: "outro-id",
        organization_id: "outra-org",
      }),
    );

    const receivedInput = updateLead.mock.calls[0]?.[1];
    expect(receivedInput).not.toHaveProperty("id");
    expect(receivedInput).not.toHaveProperty("organization_id");
  });

  it("omite leadSourceId do payload quando o valor reenviado é igual ao atual (não revalida active à toa)", async () => {
    getLeadById.mockResolvedValue(EXISTING_LEAD);
    updateLead.mockResolvedValue({ id: "lead-1" });

    await updateLeadAction(
      "lead-1",
      { status: "idle" },
      formDataFrom({
        name: "Novo Nome",
        leadSourceId: EXISTING_LEAD.lead_source_id,
      }),
    );

    const receivedInput = updateLead.mock.calls[0]?.[1];
    expect(receivedInput).not.toHaveProperty("leadSourceId");
  });

  it("mantém leadSourceId no payload quando o usuário realmente troca a origem", async () => {
    getLeadById.mockResolvedValue(EXISTING_LEAD);
    updateLead.mockResolvedValue({ id: "lead-1" });
    const newSourceId = "33333333-3333-4333-8333-333333333333";

    await updateLeadAction(
      "lead-1",
      { status: "idle" },
      formDataFrom({ name: "Novo Nome", leadSourceId: newSourceId }),
    );

    const receivedInput = updateLead.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(receivedInput.leadSourceId).toBe(newSourceId);
  });
});

describe("loadLeadForEditAction", () => {
  it("retorna lead + opções quando tudo carrega com sucesso", async () => {
    getLeadById.mockResolvedValue(EXISTING_LEAD);
    listLeadSources.mockResolvedValue([{ id: "s1", name: "Instagram" }]);
    listOrganizationProfiles.mockResolvedValue([{ id: "p1", name: "Jhanry" }]);

    const result = await loadLeadForEditAction("lead-1");

    expect(result.status).toBe("success");
    expect(result.lead).toEqual(EXISTING_LEAD);
    expect(listLeadSources).toHaveBeenCalledWith({ includeInactive: true });
    expect(listOrganizationProfiles).toHaveBeenCalledWith({
      includeInactive: true,
    });
  });

  it("lead cross-tenant (NOT_FOUND) mapeia para mensagem segura", async () => {
    getLeadById.mockRejectedValue(new AppError("NOT_FOUND", "detalhe"));

    const result = await loadLeadForEditAction("lead-de-outro-tenant");

    expect(result.status).toBe("error");
    expect(result.message).toBe("Lead não encontrado.");
  });

  it("erro inesperado não vaza detalhe interno", async () => {
    getLeadById.mockRejectedValue(new Error("boom"));

    const result = await loadLeadForEditAction("lead-1");

    expect(result.status).toBe("error");
    expect(JSON.stringify(result)).not.toContain("boom");
  });
});
