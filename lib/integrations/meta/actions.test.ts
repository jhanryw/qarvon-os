import { describe, expect, it, vi, beforeEach } from "vitest";
import { AppError } from "@/lib/errors";

const { upsertMetaIntegrationSettings, retryConversionEvent } = vi.hoisted(() => ({
  upsertMetaIntegrationSettings: vi.fn(),
  retryConversionEvent: vi.fn(),
}));
vi.mock("@/lib/integrations/meta/mutations", () => ({
  upsertMetaIntegrationSettings,
  retryConversionEvent,
}));

const { upsertMetaIntegrationSettingsAction, retryConversionEventAction } = await import(
  "@/lib/integrations/meta/actions"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upsertMetaIntegrationSettingsAction", () => {
  it("retorna success + settings quando a mutation resolve", async () => {
    upsertMetaIntegrationSettings.mockResolvedValue({
      pixelId: "123",
      conversionValueMode: "TCV",
      active: true,
      hasAccessToken: true,
    });

    const result = await upsertMetaIntegrationSettingsAction({ pixelId: "123" });
    expect(result.success).toBe(true);
    expect(result.settings?.hasAccessToken).toBe(true);
  });

  it("mapeia NO_ACCESS (usuário não-admin tentando configurar) para mensagem amigável", async () => {
    upsertMetaIntegrationSettings.mockRejectedValue(new AppError("NO_ACCESS", "x"));

    const result = await upsertMetaIntegrationSettingsAction({ active: true });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/administradores/i);
  });

  it("nunca lança — mesmo erro inesperado vira resultado com success:false", async () => {
    upsertMetaIntegrationSettings.mockRejectedValue(new Error("boom"));

    await expect(upsertMetaIntegrationSettingsAction({})).resolves.toMatchObject({
      success: false,
    });
  });
});

describe("retryConversionEventAction", () => {
  it("retorna success quando o retry resolve", async () => {
    retryConversionEvent.mockResolvedValue(undefined);
    const result = await retryConversionEventAction("event-1");
    expect(result).toEqual({ success: true });
  });

  it("retorna erro amigável quando o evento não é encontrado", async () => {
    retryConversionEvent.mockRejectedValue(new AppError("NOT_FOUND", "x"));
    const result = await retryConversionEventAction("event-inexistente");
    expect(result.success).toBe(false);
  });
});
