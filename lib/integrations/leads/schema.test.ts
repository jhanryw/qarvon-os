import { describe, expect, it } from "vitest";
import { leadIntakeSchema } from "@/lib/integrations/leads/schema";

const MINIMAL_VALID = {
  external_submission_id: "sub-001",
  name: "Maria Teste",
  whatsapp: "(11) 91234-5678",
};

describe("leadIntakeSchema", () => {
  it("aceita o payload mínimo válido", () => {
    const result = leadIntakeSchema.safeParse(MINIMAL_VALID);
    expect(result.success).toBe(true);
  });

  it("aplica version = 1 por default quando omitido", () => {
    const result = leadIntakeSchema.parse(MINIMAL_VALID);
    expect(result.version).toBe(1);
  });

  it("aceita um payload completo com atribuição, incluindo campos Google (gclid/gbraid/wbraid)", () => {
    const result = leadIntakeSchema.safeParse({
      ...MINIMAL_VALID,
      company: "Loja Teste",
      revenue_range: "100k_500k",
      invests_paid_traffic: true,
      attribution: {
        utm_source: "meta",
        utm_medium: "cpc",
        fbclid: "fb.1.123",
        gclid: "Cj0KCQ...",
        gbraid: "abc123",
        wbraid: "def456",
        landing_page: "https://qarvon.com.br/",
        referrer: "",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejeita external_submission_id ausente", () => {
    const result = leadIntakeSchema.safeParse({
      name: "Maria Teste",
      whatsapp: "(11) 91234-5678",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita name ausente", () => {
    const result = leadIntakeSchema.safeParse({
      external_submission_id: "sub-001",
      whatsapp: "(11) 91234-5678",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita whatsapp ausente", () => {
    const result = leadIntakeSchema.safeParse({
      external_submission_id: "sub-001",
      name: "Maria Teste",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita revenue_range como label de texto livre (não é mais aceito, só o código estável)", () => {
    const result = leadIntakeSchema.safeParse({
      ...MINIMAL_VALID,
      revenue_range: "R$100 mil a R$500 mil/mês",
    });
    expect(result.success).toBe(false);
  });

  it("aceita revenue_range omitido", () => {
    const result = leadIntakeSchema.safeParse(MINIMAL_VALID);
    expect(result.success).toBe(true);
  });

  it("rejeita invests_paid_traffic não booleano", () => {
    const result = leadIntakeSchema.safeParse({
      ...MINIMAL_VALID,
      invests_paid_traffic: "sim",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita chave desconhecida no nível raiz (contrato estrito)", () => {
    const result = leadIntakeSchema.safeParse({
      ...MINIMAL_VALID,
      organization_id: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita chave desconhecida dentro de attribution", () => {
    const result = leadIntakeSchema.safeParse({
      ...MINIMAL_VALID,
      attribution: { ttclid: "abc" },
    });
    expect(result.success).toBe(false);
  });

  it("aceita referrer como string vazia (visita direta, distinto de omitido)", () => {
    const result = leadIntakeSchema.safeParse({
      ...MINIMAL_VALID,
      attribution: { referrer: "" },
    });
    expect(result.success).toBe(true);
  });

  it("rejeita name com 1 caractere (mínimo de 2)", () => {
    const result = leadIntakeSchema.safeParse({ ...MINIMAL_VALID, name: "A" });
    expect(result.success).toBe(false);
  });
});
