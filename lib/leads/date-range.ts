// Limites de dia (hoje/atrasado/futuro) no timezone da organização, sem
// biblioteca externa. Buckets são por DIA, não por instante: um next_action
// marcado para hoje às 08:00 continua em "Hoje" o dia inteiro, não vira
// "Atrasada" no meio da tarde — mais previsível para quem está olhando a
// lista.

// Offset (minutos) do timezone nomeado em relação a UTC, no instante dado.
// Convenção: negativo para timezones a oeste de UTC (Brasil = -180).
// Técnica padrão via Intl: formata o instante no timezone alvo, trata os
// campos resultantes como se fossem UTC, e compara com o instante real.
function getTimezoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return (asUtc - date.getTime()) / 60_000;
}

function getLocalDateParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day") };
}

// Início do dia (00:00:00 local) em `timeZone`, para a data local
// correspondente a `date`, como instante UTC real — nunca o timezone
// implícito do servidor/browser.
export function startOfLocalDay(date: Date, timeZone: string): Date {
  const { year, month, day } = getLocalDateParts(date, timeZone);
  const naiveUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offsetMinutes = getTimezoneOffsetMinutes(new Date(naiveUtc), timeZone);
  return new Date(naiveUtc - offsetMinutes * 60_000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export type NextActionFilter = "overdue" | "today" | "future" | "none";

export interface NextActionRange {
  gte?: string;
  lt?: string;
  isNull?: boolean;
}

// Calcula os limites (ISO/UTC) de cada opção de filtro de próxima ação,
// respeitando o timezone da organização.
export function computeNextActionRange(
  filter: NextActionFilter,
  timezone: string,
  now: Date = new Date(),
): NextActionRange {
  if (filter === "none") return { isNull: true };

  const startOfToday = startOfLocalDay(now, timezone);
  const startOfTomorrow = addDays(startOfToday, 1);

  switch (filter) {
    case "overdue":
      return { lt: startOfToday.toISOString() };
    case "today":
      return {
        gte: startOfToday.toISOString(),
        lt: startOfTomorrow.toISOString(),
      };
    case "future":
      return { gte: startOfTomorrow.toISOString() };
  }
}
