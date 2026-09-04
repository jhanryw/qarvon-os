import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";
import { AppError } from "@/lib/errors";

const { createLead } = vi.hoisted(() => ({ createLead: vi.fn() }));
vi.mock("@/lib/leads/mutations", () => ({ createLead }));

const { createLeadAction } = await import("@/lib/leads/actions");

function formDataFrom(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

beforeEach(() => {
  createLead.mockReset();
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
    expect(result.message).toBe("Já existe um lead com este WhatsApp.");
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
