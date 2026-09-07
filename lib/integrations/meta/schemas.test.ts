import { describe, expect, it } from "vitest";
import { metaIntegrationSettingsSchema } from "@/lib/integrations/meta/schemas";

describe("metaIntegrationSettingsSchema", () => {
  it("aceita todos os campos omitidos (atualização parcial)", () => {
    expect(metaIntegrationSettingsSchema.safeParse({}).success).toBe(true);
  });

  it("aceita um payload completo", () => {
    const result = metaIntegrationSettingsSchema.safeParse({
      pixelId: "123456789",
      accessToken: "EAAB...",
      conversionValueMode: "TCV",
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita conversionValueMode fora do enum MRR/TCV", () => {
    const result = metaIntegrationSettingsSchema.safeParse({ conversionValueMode: "ARR" });
    expect(result.success).toBe(false);
  });

  it("rejeita pixelId vazio (distinto de omitido/nulo)", () => {
    const result = metaIntegrationSettingsSchema.safeParse({ pixelId: "" });
    expect(result.success).toBe(false);
  });

  it("aceita pixelId/accessToken explicitamente nulos", () => {
    const result = metaIntegrationSettingsSchema.safeParse({ pixelId: null, accessToken: null });
    expect(result.success).toBe(true);
  });
});
