export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "NO_ACCESS"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "DUPLICATE_WHATSAPP"
  | "INVALID_OWNER"
  | "INVALID_LEAD_SOURCE"
  | "NO_DEFAULT_PIPELINE"
  | "STAGE_PROTECTED"
  | "REASSIGN_STAGE_REQUIRED"
  | "DEAL_VALUE_REQUIRED"
  | "DATABASE_ERROR";

// Erro de aplicação com código estável para a UI decidir como reagir.
// `message` é sempre seguro para exibir; `cause` guarda o erro original
// (ex.: PostgrestError) só para log/debug server-side — nunca deve ser
// serializado de volta para o client.
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly cause?: unknown;

  constructor(code: AppErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.cause = cause;
  }
}

// Marcadores QARVON_* vêm da mensagem da exceção Postgres (raise_qarvon_error
// define message = o próprio marcador) — as RPCs transacionais (M2.2+)
// levantam esses marcadores em vez de mensagens humanas, para o TypeScript
// nunca precisar parsear texto que pode mudar de redação. Um marcador não
// mapeado aqui vira DATABASE_ERROR (genérico, nunca expõe SQL cru).
const QARVON_ERROR_CODE_MAP: Record<string, AppErrorCode> = {
  QARVON_NO_ACCESS: "NO_ACCESS",
  QARVON_INVALID_INPUT: "VALIDATION_ERROR",
  QARVON_INVALID_OWNER: "INVALID_OWNER",
  QARVON_INVALID_LEAD_SOURCE: "INVALID_LEAD_SOURCE",
  QARVON_DUPLICATE_WHATSAPP: "DUPLICATE_WHATSAPP",
  QARVON_NO_DEFAULT_PIPELINE: "NO_DEFAULT_PIPELINE",
  QARVON_LEAD_NOT_FOUND: "NOT_FOUND",
  QARVON_STAGE_NOT_FOUND: "NOT_FOUND",
  QARVON_PIPELINE_NOT_FOUND: "NOT_FOUND",
  QARVON_STAGE_PROTECTED: "STAGE_PROTECTED",
  QARVON_REASSIGN_STAGE_REQUIRED: "REASSIGN_STAGE_REQUIRED",
  QARVON_DEAL_VALUE_REQUIRED: "DEAL_VALUE_REQUIRED",
  QARVON_META_CREDENTIALS_REQUIRED: "VALIDATION_ERROR",
};

export function mapQarvonError(
  error: { message: string },
  fallbackMessage: string,
): AppError {
  const code = QARVON_ERROR_CODE_MAP[error.message];
  if (code) {
    return new AppError(code, fallbackMessage, error);
  }
  return new AppError("DATABASE_ERROR", fallbackMessage, error);
}
