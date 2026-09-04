// Formatação de exibição da listagem de leads. Puro — nunca altera o valor
// salvo, só como ele aparece na tela. Datas sempre com timeZone explícito
// (nunca o timezone "local" implícito do runtime): assim o resultado é
// idêntico não importa onde rode (server ou, futuramente, client),
// respeitando o timezone da organização em vez do timezone do container.

export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const TEMPERATURE_LABELS: Record<"COLD" | "WARM" | "HOT", string> = {
  COLD: "Frio",
  WARM: "Morno",
  HOT: "Quente",
};

export function formatTemperature(
  value: "COLD" | "WARM" | "HOT" | null,
): string {
  return value ? TEMPERATURE_LABELS[value] : "—";
}

export function formatOwnerName(name: string | null): string {
  return name ?? "Sem responsável";
}

export function formatLeadSourceName(name: string | null): string {
  return name ?? "Sem origem";
}

const BR_WHATSAPP_PATTERN = /^55(\d{2})(\d{4,5})(\d{4})$/;

// Só reformata quando reconhece o padrão canônico BR (DDI 55 + DDD + número);
// qualquer outro formato aparece exatamente como foi salvo.
export function formatWhatsapp(value: string | null): string {
  if (!value) return "—";
  const match = BR_WHATSAPP_PATTERN.exec(value);
  if (!match) return value;
  const [, ddd, first, last] = match;
  return `+55 (${ddd}) ${first}-${last}`;
}
