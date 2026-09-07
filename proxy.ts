import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // api/integrations/* nunca deve passar por aqui: autentica por Bearer
  // token (lib/integrations/leads/auth.ts), não por sessão Supabase — é
  // chamado server-to-server (ex.: LP pública) sem cookie nenhum. Sem essa
  // exclusão, updateSession redireciona qualquer request sem sessão para
  // /login (307), e como o método original é preservado nesse redirect, o
  // resultado final é 405 na rota /login (que só aceita GET) — o chamador
  // nunca alcança a validação de Bearer token de verdade. Mesmo tratamento
  // já dado a api/health, por raciocínio idêntico.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/integrations|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
