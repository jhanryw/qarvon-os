// Normalização de dados de lead. Funções puras — validação de formato fica
// em schemas.ts, separada de propósito.

// Canônico: só dígitos, com código de país. Prioridade Brasil: se o usuário
// não informou "+", tratamos como número nacional brasileiro (formato mais
// comum aqui) e prefixamos "55". Se o usuário informou "+", o código de
// país é dele — nunca sobrescrevemos (evita destruir número internacional
// válido). Não valida existência real do número.
export function normalizeWhatsapp(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasExplicitCountryCode = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (hasExplicitCountryCode) {
    return digits;
  }

  // Já parece BR com DDI (fixo: 12 dígitos, celular: 13) — mantém como está.
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  // Formato nacional BR sem DDI (fixo: 10, celular: 11) — prioridade Brasil.
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  // Não reconhecido como BR nacional nem DDI explícito: não inventar país.
  return digits;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// Remove um único "@" inicial (padrão de handle do Instagram). Não tenta
// interpretar URLs completas — normalização deliberadamente leve.
export function normalizeInstagram(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
}

// Não adiciona protocolo automaticamente — mudaria o dado que o usuário
// digitou sem ele pedir.
export function normalizeWebsite(raw: string): string {
  return raw.trim();
}

// Arredonda para 2 casas decimais via inteiro (centavos) para evitar erro
// de ponto flutuante na conversão para numeric(14,2).
export function normalizeEstimatedValue(value: number): number {
  return Math.round(value * 100) / 100;
}

// Normaliza para UTC ISO 8601 — armazenamento consistente independente do
// offset de timezone que o client enviou.
export function normalizeNextActionAt(raw: string): string {
  return new Date(raw).toISOString();
}
