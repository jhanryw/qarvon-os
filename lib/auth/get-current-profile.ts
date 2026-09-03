import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Organization = Database["public"]["Tables"]["organizations"]["Row"];

export type CurrentUser =
  | { status: "unauthenticated" }
  | { status: "no-profile" }
  | { status: "inactive"; profile: Profile }
  | { status: "authorized"; profile: Profile; organization: Organization };

// Único ponto que resolve "quem é o usuário e a qual organização pertence".
// Uma conta criada no Auth sem profile vinculado explicitamente não tem acesso:
// o vínculo é um passo administrativo separado (ver supabase/BOOTSTRAP.md).
export async function getCurrentUser(): Promise<CurrentUser> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // Erro real (ex.: tabela inexistente, falha de conexão) não é a mesma
  // coisa que "sem profile" — tratá-los igual mascararia um problema de
  // infraestrutura como se fosse só conta não vinculada.
  if (profileError) {
    throw new Error(`Falha ao consultar profiles: ${profileError.message}`);
  }

  if (!profile) {
    return { status: "no-profile" };
  }

  if (!profile.active) {
    return { status: "inactive", profile };
  }

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", profile.organization_id)
    .single();

  if (organizationError || !organization) {
    throw new Error(
      `Falha ao consultar organization do profile: ${organizationError?.message ?? "não encontrada"}`,
    );
  }

  return { status: "authorized", profile, organization };
}
