import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  formatLeadSourceName,
  formatOwnerName,
  formatTemperature,
  formatWhatsapp,
} from "@/lib/leads/format";

describe("formatTemperature", () => {
  it("mapeia COLD/WARM/HOT para os labels em português", () => {
    expect(formatTemperature("COLD")).toBe("Frio");
    expect(formatTemperature("WARM")).toBe("Morno");
    expect(formatTemperature("HOT")).toBe("Quente");
  });

  it("null vira travessão", () => {
    expect(formatTemperature(null)).toBe("—");
  });
});

describe("formatOwnerName", () => {
  it("null vira 'Sem responsável'", () => {
    expect(formatOwnerName(null)).toBe("Sem responsável");
  });

  it("nome existente é preservado", () => {
    expect(formatOwnerName("Jhanry")).toBe("Jhanry");
  });
});

describe("formatLeadSourceName", () => {
  it("null vira 'Sem origem'", () => {
    expect(formatLeadSourceName(null)).toBe("Sem origem");
  });

  it("nome existente é preservado", () => {
    expect(formatLeadSourceName("Instagram")).toBe("Instagram");
  });
});

describe("formatWhatsapp", () => {
  it("formata número canônico BR (celular) de forma amigável", () => {
    expect(formatWhatsapp("5584999200001")).toBe("+55 (84) 99920-0001");
  });

  it("formata número canônico BR (fixo) de forma amigável", () => {
    expect(formatWhatsapp("558432221111")).toBe("+55 (84) 3222-1111");
  });

  it("mantém formato não reconhecido como está, sem alterar o valor", () => {
    expect(formatWhatsapp("15551234567")).toBe("15551234567");
  });

  it("null vira travessão", () => {
    expect(formatWhatsapp(null)).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("formata no timezone explícito informado, não no timezone do runtime", () => {
    const result = formatDateTime(
      "2026-03-10T12:00:00.000Z",
      "America/Sao_Paulo",
    );
    // 12:00 UTC = 09:00 em America/Sao_Paulo (UTC-3)
    expect(result).toContain("09:00");
    expect(result).toContain("10/03/2026");
  });

  it("mesmo instante formata diferente em timezones diferentes (prova que respeita o parâmetro)", () => {
    const iso = "2026-03-10T12:00:00.000Z";
    const brasilia = formatDateTime(iso, "America/Sao_Paulo");
    const utc = formatDateTime(iso, "UTC");
    expect(brasilia).not.toBe(utc);
  });
});
