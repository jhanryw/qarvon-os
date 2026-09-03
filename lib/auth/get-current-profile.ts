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

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return { status: "no-profile" };
  }

  if (!profile.active) {
    return { status: "inactive", profile };
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", profile.organization_id)
    .single();

  if (!organization) {
    return { status: "no-profile" };
  }

  return { status: "authorized", profile, organization };
}
