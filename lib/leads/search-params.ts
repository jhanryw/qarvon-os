// Parse dos query params da listagem de leads. Nunca confia cegamente no
// que vem da URL: cada campo é validado individualmente, com fallback
// seguro e independente por campo (uma page inválida não descarta um
// search válido, e vice-versa) — em vez de rejeitar a URL inteira.

export type NextActionFilter = "overdue" | "today" | "future" | "none";

export interface ParsedLeadListParams {
  search?: string;
  page: number;
  ownerId?: string | "none";
  leadSourceId?: string | "none";
  temperature?: "COLD" | "WARM" | "HOT";
  nextActionFilter?: NextActionFilter;
  minEstimatedValue?: number;
  maxEstimatedValue?: number;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getFirst(raw: RawSearchParams, key: string): string | undefined {
  const value = raw[key];
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(raw?: string): number {
  if (!raw) return 1;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

function parseSearch(raw?: string): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function parseOwnerOrSourceFilter(raw?: string): string | "none" | undefined {
  if (!raw) return undefined;
  if (raw === "none") return "none";
  return UUID_PATTERN.test(raw) ? raw : undefined;
}

function parseTemperature(raw?: string): "COLD" | "WARM" | "HOT" | undefined {
  return raw === "COLD" || raw === "WARM" || raw === "HOT" ? raw : undefined;
}

function parseNextActionFilter(raw?: string): NextActionFilter | undefined {
  return raw === "overdue" || raw === "today" || raw === "future" || raw === "none"
    ? raw
    : undefined;
}

function parseMoneyValue(raw?: string): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function parseLeadListSearchParams(
  raw: RawSearchParams,
): ParsedLeadListParams {
  const minEstimatedValue = parseMoneyValue(getFirst(raw, "minValue"));
  const maxEstimatedValue = parseMoneyValue(getFirst(raw, "maxValue"));
  // Combinação inválida (min > max) não deve derrubar a página — em vez de
  // deixar chegar ao schema mais estrito de listLeads(), já cai aqui como
  // "sem filtro de valor", o mesmo padrão de fallback seguro dos outros
  // campos.
  const validRange =
    minEstimatedValue === undefined ||
    maxEstimatedValue === undefined ||
    maxEstimatedValue >= minEstimatedValue;

  return {
    search: parseSearch(getFirst(raw, "search")),
    page: parsePage(getFirst(raw, "page")),
    ownerId: parseOwnerOrSourceFilter(getFirst(raw, "owner")),
    leadSourceId: parseOwnerOrSourceFilter(getFirst(raw, "source")),
    temperature: parseTemperature(getFirst(raw, "temperature")),
    nextActionFilter: parseNextActionFilter(getFirst(raw, "nextAction")),
    minEstimatedValue: validRange ? minEstimatedValue : undefined,
    maxEstimatedValue: validRange ? maxEstimatedValue : undefined,
  };
}
