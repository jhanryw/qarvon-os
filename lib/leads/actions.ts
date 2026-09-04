"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createLead, updateLead } from "@/lib/leads/mutations";
import { getLeadById } from "@/lib/leads/queries";
import { parseCreateLeadFormData } from "@/lib/leads/form";
import { listLeadSources } from "@/lib/leads/queries";
import { listOrganizationProfiles } from "@/lib/profiles/queries";
import { AppError, type AppErrorCode } from "@/lib/errors";
import type { Lead, LeadSource } from "@/lib/leads/queries";
import type { ProfileOption } from "@/lib/profiles/queries";

export interface LeadFormActionState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
}

function friendlyMessage(code: AppErrorCode): string {
  switch (code) {
    case "DUPLICATE_WHATSAPP":
      return "Já existe outro lead com este WhatsApp.";
    case "INVALID_OWNER":
      return "O responsável selecionado não está disponível.";
    case "INVALID_LEAD_SOURCE":
      return "A origem selecionada não está disponível.";
    case "VALIDATION_ERROR":
      return "Verifique os dados informados.";
    case "NOT_FOUND":
      return "Lead não encontrado.";
    case "DATABASE_ERROR":
    default:
      return "Não foi possível salvar o lead. Tente novamente.";
  }
}

// Mapeamento de erro compartilhado por create/update: nunca serializa
// cause/SQL/stack para o browser; sessão/acesso viram redirect (quem
// cuida disso é o fluxo de auth, não o formulário).
function mapActionError(error: unknown, logLabel: string): LeadFormActionState {
  if (error instanceof z.ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return {
      status: "error",
      message: "Verifique os campos destacados.",
      fieldErrors,
    };
  }

  if (error instanceof AppError) {
    if (error.code === "UNAUTHENTICATED") redirect("/login");
    if (error.code === "NO_ACCESS") redirect("/sem-acesso");
    return { status: "error", message: friendlyMessage(error.code) };
  }

  console.error(`${logLabel}: erro inesperado`, error);
  return {
    status: "error",
    message: "Não foi possível salvar o lead. Tente novamente.",
  };
}

export async function createLeadAction(
  _prevState: LeadFormActionState,
  formData: FormData,
): Promise<LeadFormActionState> {
  try {
    const input = parseCreateLeadFormData(formData);
    await createLead(input);
    return { status: "success" };
  } catch (error) {
    return mapActionError(error, "createLeadAction");
  }
}

// Recebe leadId separadamente (bind na chamada, não no schema de input) —
// organization_id/id continuam fora do que o client pode enviar.
export async function updateLeadAction(
  leadId: string,
  _prevState: LeadFormActionState,
  formData: FormData,
): Promise<LeadFormActionState> {
  try {
    const current = await getLeadById(leadId);
    const input = parseCreateLeadFormData(formData) as Record<string, unknown>;

    // lead_source_id só entra no payload se o usuário realmente trocou.
    // updateLead() revalida "active" sempre que o campo está presente no
    // input — mas o formulário reenvia o valor atual mesmo sem o usuário
    // tocar nele, então uma source histórica desativada seria rejeitada
    // à toa se não filtrarmos aqui o que de fato mudou.
    const currentSourceId = current.lead_source_id ?? undefined;
    if (input.leadSourceId === currentSourceId) {
      delete input.leadSourceId;
    }

    await updateLead(leadId, input);
    return { status: "success" };
  } catch (error) {
    return mapActionError(error, "updateLeadAction");
  }
}

export interface LoadLeadForEditResult {
  status: "success" | "error";
  message?: string;
  lead?: Lead;
  leadSources?: LeadSource[];
  profiles?: ProfileOption[];
}

// Carrega o lead completo + opções (incluindo inativas, para não perder
// referência histórica) ao abrir a edição. Nunca aceita organization_id —
// o tenant vem do contexto do servidor via getLeadById/listLeadSources/
// listOrganizationProfiles.
export async function loadLeadForEditAction(
  leadId: string,
): Promise<LoadLeadForEditResult> {
  try {
    const [lead, leadSources, profiles] = await Promise.all([
      getLeadById(leadId),
      listLeadSources({ includeInactive: true }),
      listOrganizationProfiles({ includeInactive: true }),
    ]);
    return { status: "success", lead, leadSources, profiles };
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "UNAUTHENTICATED") redirect("/login");
      if (error.code === "NO_ACCESS") redirect("/sem-acesso");
      return { status: "error", message: friendlyMessage(error.code) };
    }
    console.error("loadLeadForEditAction: erro inesperado", error);
    return {
      status: "error",
      message: "Não foi possível carregar o lead. Tente novamente.",
    };
  }
}
