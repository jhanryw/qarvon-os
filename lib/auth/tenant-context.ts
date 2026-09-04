// Sem "server-only" próprio de propósito: a proteção real é transitiva via
// get-current-profile.ts (que já a tem) — repeti-la aqui só bloquearia
// testar o mapeamento de erro abaixo sem ganhar segurança adicional (o
// bundler já barra este módulo se algo tentar importá-lo no client, por
// causa dessa mesma dependência).
import { getCurrentUser } from "@/lib/auth/get-current-profile";
import type { Organization, Profile } from "@/lib/auth/get-current-profile";
import { AppError } from "@/lib/errors";

export interface TenantContext {
  profile: Profile;
  organization: Organization;
  organizationId: string;
}

// Ponto único que qualquer operação de dados (leads, e futuramente
// deals/activities) usa para resolver o tenant autenticado. organization_id
// nunca vem de fora — sempre derivado do profile lido server-side via
// getCurrentUser (sessão), nunca do client.
export async function getTenantContext(): Promise<TenantContext> {
  const user = await getCurrentUser();

  switch (user.status) {
    case "unauthenticated":
      throw new AppError("UNAUTHENTICATED", "Sessão não autenticada.");
    case "no-profile":
    case "inactive":
      throw new AppError(
        "NO_ACCESS",
        "Usuário não vinculado a uma organização ou inativo.",
      );
    case "authorized":
      return {
        profile: user.profile,
        organization: user.organization,
        organizationId: user.profile.organization_id,
      };
  }
}
