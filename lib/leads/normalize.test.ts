import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  normalizeEstimatedValue,
  normalizeInstagram,
  normalizeNextActionAt,
  normalizeWebsite,
  normalizeWhatsapp,
} from "@/lib/leads/normalize";

describe("normalizeWhatsapp", () => {
  it("normaliza formato local com DDD entre parênteses", () => {
    expect(normalizeWhatsapp("(84) 99999-9999")).toBe("5584999999999");
  });

  it("normaliza formato local com espaço", () => {
    expect(normalizeWhatsapp("84 99999-9999")).toBe("5584999999999");
  });

  it("normaliza formato com + e DDI já presente para o mesmo canônico", () => {
    expect(normalizeWhatsapp("+55 84 99999-9999")).toBe("5584999999999");
  });

  it("mantém formato já canônico (só dígitos, com DDI)", () => {
    expect(normalizeWhatsapp("5584999999999")).toBe("5584999999999");
  });

  it("não destrói código de país de número internacional explícito", () => {
    expect(normalizeWhatsapp("+1 555 123 4567")).toBe("15551234567");
  });

  it("normaliza fixo nacional (10 dígitos) prefixando 55", () => {
    expect(normalizeWhatsapp("(84) 3222-1111")).toBe("558432221111");
  });

  it("retorna null para string vazia", () => {
    expect(normalizeWhatsapp("   ")).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("remove espaços e converte para minúsculo", () => {
    expect(normalizeEmail("  Jhanry@Qarvon.COM  ")).toBe("jhanry@qarvon.com");
  });
});

describe("normalizeInstagram", () => {
  it("remove @ inicial", () => {
    expect(normalizeInstagram("@qarvon.os")).toBe("qarvon.os");
  });

  it("mantém handle sem @", () => {
    expect(normalizeInstagram("qarvon.os")).toBe("qarvon.os");
  });
});

describe("normalizeWebsite", () => {
  it("não adiciona protocolo, só remove espaços", () => {
    expect(normalizeWebsite("  qarvon.com.br  ")).toBe("qarvon.com.br");
  });
});

describe("normalizeEstimatedValue", () => {
  it("mantém valores já com até 2 casas decimais", () => {
    expect(normalizeEstimatedValue(1500)).toBe(1500);
    expect(normalizeEstimatedValue(1234.5)).toBe(1234.5);
  });

  it("arredonda valores com mais de 2 casas decimais", () => {
    expect(normalizeEstimatedValue(19.999)).toBe(20);
  });
});

describe("normalizeNextActionAt", () => {
  it("converte para ISO UTC independente do offset de entrada", () => {
    expect(normalizeNextActionAt("2026-03-10T09:00:00-03:00")).toBe(
      "2026-03-10T12:00:00.000Z",
    );
  });
});
