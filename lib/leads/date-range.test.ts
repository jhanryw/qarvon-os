import { describe, expect, it } from "vitest";
import {
  addDays,
  computeNextActionRange,
  startOfLocalDay,
} from "@/lib/leads/date-range";

describe("startOfLocalDay", () => {
  it("calcula meia-noite local em UTC (offset zero)", () => {
    const result = startOfLocalDay(new Date("2026-03-10T15:30:00.000Z"), "UTC");
    expect(result.toISOString()).toBe("2026-03-10T00:00:00.000Z");
  });

  it("calcula meia-noite local em America/Sao_Paulo (UTC-3)", () => {
    const result = startOfLocalDay(
      new Date("2026-03-10T15:30:00.000Z"),
      "America/Sao_Paulo",
    );
    // 2026-03-10 00:00 em São Paulo = 2026-03-10 03:00 UTC
    expect(result.toISOString()).toBe("2026-03-10T03:00:00.000Z");
  });

  it("respeita a virada de dia: instante já é outro dia em UTC mas ainda é o dia anterior no timezone local", () => {
    // 02:00 UTC = 23:00 do dia anterior em São Paulo (UTC-3)
    const result = startOfLocalDay(
      new Date("2026-03-10T02:00:00.000Z"),
      "America/Sao_Paulo",
    );
    expect(result.toISOString()).toBe("2026-03-09T03:00:00.000Z");
  });
});

describe("addDays", () => {
  it("soma dias preservando o horário", () => {
    const result = addDays(new Date("2026-03-10T03:00:00.000Z"), 1);
    expect(result.toISOString()).toBe("2026-03-11T03:00:00.000Z");
  });
});

const TZ = "America/Sao_Paulo";
// "Agora" fixo para os testes: 10/03/2026 12:00 UTC = 09:00 em São Paulo.
const NOW = new Date("2026-03-10T12:00:00.000Z");

describe("computeNextActionRange", () => {
  it("overdue: tudo antes do início do dia local de hoje", () => {
    const range = computeNextActionRange("overdue", TZ, NOW);
    expect(range).toEqual({ lt: "2026-03-10T03:00:00.000Z" });
  });

  it("today: do início ao fim do dia local de hoje", () => {
    const range = computeNextActionRange("today", TZ, NOW);
    expect(range).toEqual({
      gte: "2026-03-10T03:00:00.000Z",
      lt: "2026-03-11T03:00:00.000Z",
    });
  });

  it("future: a partir do início do dia local de amanhã", () => {
    const range = computeNextActionRange("future", TZ, NOW);
    expect(range).toEqual({ gte: "2026-03-11T03:00:00.000Z" });
  });

  it("none: filtro por next_action_at nulo, não usa datas", () => {
    const range = computeNextActionRange("none", TZ, NOW);
    expect(range).toEqual({ isNull: true });
  });

  it("respeita timezone diferente para o mesmo instante", () => {
    const rangeSaoPaulo = computeNextActionRange("today", "America/Sao_Paulo", NOW);
    const rangeUtc = computeNextActionRange("today", "UTC", NOW);
    expect(rangeSaoPaulo).not.toEqual(rangeUtc);
  });
});
