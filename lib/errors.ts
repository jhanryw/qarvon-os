export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "NO_ACCESS"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "DUPLICATE_WHATSAPP"
  | "INVALID_OWNER"
  | "INVALID_LEAD_SOURCE"
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
