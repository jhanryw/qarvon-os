// Hook de eventos de domínio — hoje só loga estruturado. O transporte real
// (Telegram/push/e-mail/notification center) é decisão de produto ainda não
// tomada; o contrato (nome + payload) fica estável agora, para que quando o
// transporte for implementado, quem dispara o evento não precise mudar.
//
// Chamado pelo caller SEMPRE aguardado (await) dentro de um try/catch, ANTES
// da resposta HTTP ser construída — nunca depois de um `return`. Falha aqui
// nunca deve virar erro para quem chamou: no momento em que este hook é
// disparado, o efeito principal (ex.: lead criado) já está commitado.
export type DomainEventName = "lead.created" | "lead.returned";

export interface DomainEventPayload {
  leadId: string;
  submissionId: string;
  isNewLead: boolean;
  occurredAt: string;
}

export async function dispatchDomainEvent(
  name: DomainEventName,
  payload: DomainEventPayload,
): Promise<void> {
  console.info(`[domain-event] ${name}`, payload);
}
