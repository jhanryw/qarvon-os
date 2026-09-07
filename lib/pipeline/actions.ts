"use server";

import { z } from "zod";
import {
  moveLeadToStage,
  createPipelineStage,
  updatePipelineStage,
  reorderPipelineStages,
  deletePipelineStage,
  closeLeadWon,
  closeLeadLost,
} from "@/lib/pipeline/mutations";
import { dispatchWonConversion } from "@/lib/integrations/meta/dispatch";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { countLeadsInStage } from "@/lib/pipeline/queries";
import { AppError, type AppErrorCode } from "@/lib/errors";

// Server Actions chamadas diretamente (não via <form action>) pelos
// componentes client do Kanban/Configurações de pipeline — padrão
// suportado pelo App Router, só não usado ainda em lib/leads/actions.ts
// porque aquele fluxo é formulário tradicional. Retornam um resultado
// tipado em vez de lançar: por padrão, o Next.js redige detalhes de erro
// de Server Actions ao cruzar para o client em produção (só a mensagem
// genérica de digest chega lá) — lançar AppError perderia o `.code` e a
// mensagem amigável. Resultado explícito evita essa armadilha.
export interface PipelineActionResult {
  success: boolean;
  message?: string;
  code?: AppErrorCode;
}

function friendlyMessage(code: AppErrorCode): string {
  switch (code) {
    case "STAGE_PROTECTED":
      return "Este estágio é estrutural (Lead Novo, Ganho ou Perdido) e não pode ser desativado/excluído.";
    case "REASSIGN_STAGE_REQUIRED":
      return "Escolha um estágio de destino para os leads antes de excluir esta etapa.";
    case "DEAL_VALUE_REQUIRED":
      return "Informe pelo menos o MRR ou o TCV.";
    case "NO_DEFAULT_PIPELINE":
      return "Nenhum pipeline configurado para esta organização.";
    case "NOT_FOUND":
      return "Registro não encontrado.";
    case "VALIDATION_ERROR":
      return "Verifique os dados informados.";
    default:
      return "Não foi possível concluir a operação. Tente novamente.";
  }
}

function toResult(error: unknown, logLabel: string): PipelineActionResult {
  if (error instanceof z.ZodError) {
    return {
      success: false,
      message: error.issues[0]?.message ?? "Dados inválidos.",
      code: "VALIDATION_ERROR",
    };
  }
  if (error instanceof AppError) {
    if (error.code === "UNAUTHENTICATED" || error.code === "NO_ACCESS") {
      // Ação de fundo (drag-and-drop, config) — não faz sentido redirecionar
      // no meio de uma interação client-side. A UI trata como falha comum;
      // uma tentativa de navegação normal na sequência já cairia no
      // redirect de sessão de qualquer forma.
      return { success: false, message: "Sessão expirada. Recarregue a página.", code: error.code };
    }
    return { success: false, message: friendlyMessage(error.code), code: error.code };
  }
  console.error(`${logLabel}: erro inesperado`, error);
  return { success: false, message: "Não foi possível concluir a operação. Tente novamente." };
}

export async function moveLeadAction(input: unknown): Promise<PipelineActionResult> {
  try {
    await moveLeadToStage(input);
    return { success: true };
  } catch (error) {
    return toResult(error, "moveLeadAction");
  }
}

export async function closeLeadWonAction(input: unknown): Promise<PipelineActionResult> {
  try {
    const { organizationId } = await getTenantContext();
    const { dealId } = await closeLeadWon(input);

    // Meta CAPI nunca é parte da transação crítica: close_lead_won já
    // commitou acima. Qualquer falha aqui fica só registrada em
    // conversion_events (ver dispatchWonConversion) — nunca desfaz o
    // fechamento nem propaga erro para quem arrastou o card.
    try {
      await dispatchWonConversion({ organizationId, dealId });
    } catch (dispatchError) {
      console.error("closeLeadWonAction: dispatch Meta falhou", dispatchError);
    }

    return { success: true };
  } catch (error) {
    return toResult(error, "closeLeadWonAction");
  }
}

export async function closeLeadLostAction(input: unknown): Promise<PipelineActionResult> {
  try {
    await closeLeadLost(input);
    return { success: true };
  } catch (error) {
    return toResult(error, "closeLeadLostAction");
  }
}

export async function createPipelineStageAction(input: unknown): Promise<PipelineActionResult> {
  try {
    await createPipelineStage(input);
    return { success: true };
  } catch (error) {
    return toResult(error, "createPipelineStageAction");
  }
}

export async function updatePipelineStageAction(input: unknown): Promise<PipelineActionResult> {
  try {
    await updatePipelineStage(input);
    return { success: true };
  } catch (error) {
    return toResult(error, "updatePipelineStageAction");
  }
}

export async function reorderPipelineStagesAction(input: unknown): Promise<PipelineActionResult> {
  try {
    await reorderPipelineStages(input);
    return { success: true };
  } catch (error) {
    return toResult(error, "reorderPipelineStagesAction");
  }
}

export async function deletePipelineStageAction(input: unknown): Promise<PipelineActionResult> {
  try {
    await deletePipelineStage(input);
    return { success: true };
  } catch (error) {
    return toResult(error, "deletePipelineStageAction");
  }
}

// Recontagem no momento da exclusão (não confia só no número já renderizado
// na tela, que pode estar desatualizado se leads entraram/saíram desde o
// carregamento da página) — usada pela UI para decidir se pede um estágio
// de destino antes de chamar deletePipelineStageAction.
export async function checkStageLeadCountAction(
  stageId: string,
): Promise<{ leadCount: number } | { error: string }> {
  try {
    const leadCount = await countLeadsInStage(stageId);
    return { leadCount };
  } catch (error) {
    if (error instanceof AppError) {
      return { error: friendlyMessage(error.code) };
    }
    console.error("checkStageLeadCountAction: erro inesperado", error);
    return { error: "Não foi possível verificar os leads deste estágio." };
  }
}
