"use server";

import { z } from "zod";
import {
  upsertMetaIntegrationSettings,
  retryConversionEvent,
} from "@/lib/integrations/meta/mutations";
import { AppError, type AppErrorCode } from "@/lib/errors";
import type { MetaIntegrationSettings } from "@/lib/integrations/meta/queries";

export interface MetaSettingsActionResult {
  success: boolean;
  message?: string;
  settings?: MetaIntegrationSettings;
}

function friendlyMessage(code: AppErrorCode): string {
  switch (code) {
    case "NO_ACCESS":
      return "Só administradores podem configurar integrações.";
    case "VALIDATION_ERROR":
      return "Verifique os dados informados (o Pixel/Dataset ID e o Access Token são obrigatórios para ativar).";
    case "NOT_FOUND":
      return "Registro não encontrado.";
    default:
      return "Não foi possível salvar a configuração. Tente novamente.";
  }
}

export async function upsertMetaIntegrationSettingsAction(
  input: unknown,
): Promise<MetaSettingsActionResult> {
  try {
    const settings = await upsertMetaIntegrationSettings(input);
    return { success: true, settings };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, message: error.issues[0]?.message ?? "Dados inválidos." };
    }
    if (error instanceof AppError) {
      return { success: false, message: friendlyMessage(error.code) };
    }
    console.error("upsertMetaIntegrationSettingsAction: erro inesperado", error);
    return { success: false, message: "Não foi possível salvar a configuração. Tente novamente." };
  }
}

export async function retryConversionEventAction(
  conversionEventId: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    await retryConversionEvent(conversionEventId);
    return { success: true };
  } catch (error) {
    if (error instanceof AppError) {
      return { success: false, message: friendlyMessage(error.code) };
    }
    console.error("retryConversionEventAction: erro inesperado", error);
    return { success: false, message: "Não foi possível reenviar a conversão." };
  }
}
