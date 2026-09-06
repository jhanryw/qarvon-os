import { describe, expect, it } from "vitest";
import {
  createLeadSchema,
  listLeadsSchema,
  updateLeadSchema,
} from "@/lib/leads/schemas";

describe("createLeadSchema", () => {
  it("aceita um lead válido mínimo", () => {
    const result = createLeadSchema.safeParse({ name: "Lead Teste" });
    expect(result.success).toBe(true);
  });

  it("rejeita name vazio", () => {
    const result = createLeadSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });

  it("rejeita estimated_value negativo", () => {
    const result = createLeadSchema.safeParse({
      name: "Lead Teste",
      estimatedValue: -10,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita estimated_value não finito", () => {
    const result = createLeadSchema.safeParse({
      name: "Lead Teste",
      estimatedValue: Number.POSITIVE_INFINITY,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita organization_id (tenant não vem do input)", () => {
    const result = createLeadSchema.safeParse({
      name: "Lead Teste",
      organization_id: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita id (não pertence ao client)", () => {
    const result = createLeadSchema.safeParse({
      name: "Lead Teste",
      id: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita ownerId que não é uuid", () => {
    const result = createLeadSchema.safeParse({
      name: "Lead Teste",
      ownerId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita temperature fora do enum", () => {
    const result = createLeadSchema.safeParse({
      name: "Lead Teste",
      temperature: "BOILING",
    });
    expect(result.success).toBe(false);
  });

  it("aceita revenueRange como um dos códigos estáveis", () => {
    const result = createLeadSchema.safeParse({
      name: "Lead Teste",
      revenueRange: "100k_500k",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita revenueRange fora dos códigos estáveis (ex.: label em texto livre)", () => {
    const result = createLeadSchema.safeParse({
      name: "Lead Teste",
      revenueRange: "R$100 mil a R$500 mil/mês",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita nextActionAt inválida", () => {
    const result = createLeadSchema.safeParse({
      name: "Lead Teste",
      nextActionAt: "not-a-date",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateLeadSchema", () => {
  it("aceita objeto parcial", () => {
    const result = updateLeadSchema.safeParse({ note: "Atualizado" });
    expect(result.success).toBe(true);
  });

  it("aceita objeto vazio (nenhum campo alterado)", () => {
    const result = updateLeadSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejeita organization_id mesmo em update parcial", () => {
    const result = updateLeadSchema.safeParse({
      organization_id: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita name vazio quando enviado", () => {
    const result = updateLeadSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

describe("listLeadsSchema", () => {
  it("aplica defaults de paginação", () => {
    const result = listLeadsSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it("rejeita pageSize acima do máximo", () => {
    const result = listLeadsSchema.safeParse({ pageSize: 500 });
    expect(result.success).toBe(false);
  });

  it("rejeita page não positiva", () => {
    const result = listLeadsSchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it("rejeita search vazia (string em branco)", () => {
    const result = listLeadsSchema.safeParse({ search: "   " });
    expect(result.success).toBe(false);
  });

  it("aceita filtros válidos combinados", () => {
    const result = listLeadsSchema.safeParse({
      page: 2,
      pageSize: 10,
      search: "acme",
      temperature: "HOT",
    });
    expect(result.success).toBe(true);
  });
});
