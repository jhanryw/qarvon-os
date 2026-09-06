import { createHmac } from "node:crypto";

// hash = HMAC-SHA256(pepper, token) — nunca o inverso (HMAC(token, pepper)):
// o pepper é a chave secreta fixa do ambiente, o token é a mensagem
// variável por credencial. Calculado aqui (TypeScript), nunca em SQL — o
// banco só guarda o hash final (integration_credentials.token_hash),
// nunca o token puro nem o pepper. Ver supabase/BOOTSTRAP.md para o
// procedimento de geração/rotação.
export function computeIntegrationTokenHash(token: string, pepper: string): string {
  return createHmac("sha256", pepper).update(token).digest("hex");
}

// "Bearer <token>" (case-insensitive no prefixo, espaço único ou múltiplo).
// Retorna null para header ausente ou em formato diferente — nunca lança.
export function extractBearerToken(authorizationHeader: string | null | undefined): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

export interface IntegrationCredential {
  id: string;
}

// Tipado localmente (não contra types/database.ts): esse arquivo de tipos é
// gerado a partir do schema real e ainda não conhece integration_credentials
// (tabela criada pela migration 20260906090400, não aplicada em nenhum
// ambiente ainda) — tipar contra o gerado quebraria o typecheck do projeto
// até a regeneração pós-deploy. Regenerar os tipos torna este tipo local
// dispensável, se desejado.
export interface CredentialLookupClient {
  from(table: "integration_credentials"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        maybeSingle(): Promise<{
          data: { id: string; active: boolean } | null;
          error: unknown;
        }>;
      };
    };
  };
}

// Resolve a credencial a partir do token bruto recebido no header
// Authorization — nunca a partir de um identificador enviado pelo
// chamador. Retorna null tanto para "não encontrada" quanto para
// "encontrada mas inativa": do ponto de vista de quem chama, os dois casos
// são indistinguíveis (401), de propósito — não vazar qual dos dois
// aconteceu.
export async function resolveIntegrationCredential(
  client: CredentialLookupClient,
  token: string,
  pepper: string,
): Promise<IntegrationCredential | null> {
  const tokenHash = computeIntegrationTokenHash(token, pepper);

  const { data, error } = await client
    .from("integration_credentials")
    .select("id, active")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data || !data.active) return null;
  return { id: data.id };
}
