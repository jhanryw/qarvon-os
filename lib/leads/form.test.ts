import { describe, expect, it } from "vitest";
import { parseCreateLeadFormData } from "@/lib/leads/form";

function formDataFrom(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

describe("parseCreateLeadFormData", () => {
  it("converte campos vazios em undefined", () => {
    const result = parseCreateLeadFormData(formDataFrom({ name: "Lead Teste", company: "   " }));
    expect(result.company).toBeUndefined();
  });

  it("faz trim dos campos principais", () => {
    const result = parseCreateLeadFormData(
      formDataFrom({ name: "  Lead Teste  " }),
    );
    expect(result.name).toBe("Lead Teste");
  });

  it("mapeia temperature válida", () => {
    const result = parseCreateLeadFormData(
      formDataFrom({ name: "Lead Teste", temperature: "HOT" }),
    );
    expect(result.temperature).toBe("HOT");
  });

  it("ignora temperature desconhecida em vez de repassar valor inválido", () => {
    const result = parseCreateLeadFormData(
      formDataFrom({ name: "Lead Teste", temperature: "BOILING" }),
    );
    expect(result.temperature).toBeUndefined();
  });

  it("converte estimatedValue de string para número", () => {
    const result = parseCreateLeadFormData(
      formDataFrom({ name: "Lead Teste", estimatedValue: "1500.50" }),
    );
    expect(result.estimatedValue).toBe(1500.5);
  });

  it("estimatedValue vazio vira undefined, não NaN nem zero", () => {
    const result = parseCreateLeadFormData(
      formDataFrom({ name: "Lead Teste", estimatedValue: "" }),
    );
    expect(result.estimatedValue).toBeUndefined();
  });

  it("estimatedValue não numérico vira undefined em vez de NaN", () => {
    const result = parseCreateLeadFormData(
      formDataFrom({ name: "Lead Teste", estimatedValue: "abc" }),
    );
    expect(result.estimatedValue).toBeUndefined();
  });

  it("repassa nextActionAt já convertido para ISO pelo formulário", () => {
    const iso = "2026-03-10T12:00:00.000Z";
    const result = parseCreateLeadFormData(
      formDataFrom({ name: "Lead Teste", nextActionAt: iso }),
    );
    expect(result.nextActionAt).toBe(iso);
  });

  it("monta os campos principais corretamente", () => {
    const result = parseCreateLeadFormData(
      formDataFrom({
        name: "Lead Teste",
        whatsapp: "(84) 99999-9999",
        company: "Acme",
        ownerId: "11111111-1111-4111-8111-111111111111",
        leadSourceId: "22222222-2222-4222-8222-222222222222",
        note: "Observação",
      }),
    );
    expect(result).toMatchObject({
      name: "Lead Teste",
      whatsapp: "(84) 99999-9999",
      company: "Acme",
      ownerId: "11111111-1111-4111-8111-111111111111",
      leadSourceId: "22222222-2222-4222-8222-222222222222",
      note: "Observação",
    });
  });
});
