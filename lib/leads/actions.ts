"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createLead } from "@/lib/leads/mutations";
import { parseCreateLeadFormData } from "@/lib/leads/form";
import { AppError, type AppErrorCode } from "@/lib/errors";

export interface CreateLeadActionState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
}

function friendlyMessage(code: AppErrorCode): string {
  switch (code) {
    case "DUPLICATE_WHATSAPP":
      return "Já existe um lead com este WhatsApp.";
    case "INVALID_OWNER":
      return "O responsável selecionado não está disponível.";
    case "INVALID_LEAD_SOURCE":
      return "A origem selecionada não está disponível.";
    case "VALIDATION_ERROR":
      return "Verifique os dados informados.";
    case "NOT_FOUND":
    case "DATABASE_ERROR":
    default:
      return "Não foi possível salvar o lead. Tente novamente.";
  }
}

export async function createLeadAction(
  _prevState: CreateLeadActionState,
  formData: FormData,
): Promise<CreateLeadActionState> {
  try {
    const input = parseCreateLeadFormData(formData);
    await createLead(input);
    return { status: "success" };
  } catch (error) {
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
      // Sessão/acesso: quem cuida disso é o fluxo de auth, não o formulário.
      if (error.code === "UNAUTHENTICATED") redirect("/login");
      if (error.code === "NO_ACCESS") redirect("/sem-acesso");

      return { status: "error", message: friendlyMessage(error.code) };
    }

    // Erro realmente inesperado: log server-side, nunca exposto ao browser.
    console.error("createLeadAction: erro inesperado ao criar lead", error);
    return {
      status: "error",
      message: "Não foi possível salvar o lead. Tente novamente.",
    };
  }
}
