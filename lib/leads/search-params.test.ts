import { describe, expect, it } from "vitest";
import { parseLeadListSearchParams } from "@/lib/leads/search-params";

describe("parseLeadListSearchParams", () => {
  it("usa page=1 por padrão quando ausente", () => {
    const result = parseLeadListSearchParams({});
    expect(result.page).toBe(1);
  });

  it("page inválida cai para 1 em vez de quebrar", () => {
    expect(parseLeadListSearchParams({ page: "abc" }).page).toBe(1);
    expect(parseLeadListSearchParams({ page: "-3" }).page).toBe(1);
    expect(parseLeadListSearchParams({ page: "0" }).page).toBe(1);
    expect(parseLeadListSearchParams({ page: "2.5" }).page).toBe(1);
  });

  it("aceita page válida", () => {
    expect(parseLeadListSearchParams({ page: "3" }).page).toBe(3);
  });

  it("search vazia ou só espaços vira undefined", () => {
    expect(parseLeadListSearchParams({ search: "" }).search).toBeUndefined();
    expect(
      parseLeadListSearchParams({ search: "   " }).search,
    ).toBeUndefined();
  });

  it("search com conteúdo é preservada com trim", () => {
    expect(parseLeadListSearchParams({ search: "  acme  " }).search).toBe(
      "acme",
    );
  });

  it("uuid inválido em owner/source é ignorado, não quebra o parse inteiro", () => {
    const result = parseLeadListSearchParams({
      owner: "not-a-uuid",
      page: "2",
    });
    expect(result.ownerId).toBeUndefined();
    expect(result.page).toBe(2);
  });

  it("aceita uuid válido em owner/source", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const result = parseLeadListSearchParams({ owner: id, source: id });
    expect(result.ownerId).toBe(id);
    expect(result.leadSourceId).toBe(id);
  });

  it('reconhece "none" como filtro explícito (Sem responsável/Sem origem)', () => {
    const result = parseLeadListSearchParams({ owner: "none", source: "none" });
    expect(result.ownerId).toBe("none");
    expect(result.leadSourceId).toBe("none");
  });

  it("temperature válida é aceita", () => {
    expect(
      parseLeadListSearchParams({ temperature: "HOT" }).temperature,
    ).toBe("HOT");
  });

  it("temperature desconhecida é ignorada", () => {
    expect(
      parseLeadListSearchParams({ temperature: "BOILING" }).temperature,
    ).toBeUndefined();
  });

  it("usa apenas o primeiro valor quando o param vem duplicado", () => {
    const result = parseLeadListSearchParams({ search: ["a", "b"] });
    expect(result.search).toBe("a");
  });

  it("nextAction válido é aceito para cada opção", () => {
    expect(
      parseLeadListSearchParams({ nextAction: "overdue" }).nextActionFilter,
    ).toBe("overdue");
    expect(
      parseLeadListSearchParams({ nextAction: "today" }).nextActionFilter,
    ).toBe("today");
    expect(
      parseLeadListSearchParams({ nextAction: "future" }).nextActionFilter,
    ).toBe("future");
    expect(
      parseLeadListSearchParams({ nextAction: "none" }).nextActionFilter,
    ).toBe("none");
  });

  it("nextAction inválido é ignorado", () => {
    expect(
      parseLeadListSearchParams({ nextAction: "yesterday" }).nextActionFilter,
    ).toBeUndefined();
  });

  it("minValue/maxValue válidos são aceitos", () => {
    const result = parseLeadListSearchParams({
      minValue: "1000",
      maxValue: "5000.50",
    });
    expect(result.minEstimatedValue).toBe(1000);
    expect(result.maxEstimatedValue).toBe(5000.5);
  });

  it("minValue/maxValue inválidos (não numéricos ou negativos) são ignorados", () => {
    expect(
      parseLeadListSearchParams({ minValue: "abc" }).minEstimatedValue,
    ).toBeUndefined();
    expect(
      parseLeadListSearchParams({ minValue: "-100" }).minEstimatedValue,
    ).toBeUndefined();
  });

  it("descarta min/max quando a combinação é inválida (min > max), sem quebrar o parse", () => {
    const result = parseLeadListSearchParams({
      minValue: "5000",
      maxValue: "1000",
    });
    expect(result.minEstimatedValue).toBeUndefined();
    expect(result.maxEstimatedValue).toBeUndefined();
  });

  it("mantém min/max quando só um dos dois está presente", () => {
    expect(
      parseLeadListSearchParams({ minValue: "1000" }).minEstimatedValue,
    ).toBe(1000);
    expect(
      parseLeadListSearchParams({ maxValue: "1000" }).maxEstimatedValue,
    ).toBe(1000);
  });
});
