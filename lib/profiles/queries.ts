import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { AppError } from "@/lib/errors";

export interface ProfileOption {
  id: string;
  name: string;
}

// Lista mínima para seletores (ex.: "Responsável" no cadastro de lead): só
// id/name, só profiles ativos da organização atual. RLS normal — sem
// service role. organization_id sempre do contexto do servidor.
export async function listOrganizationProfiles(): Promise<ProfileOption[]> {
  const { organizationId } = await getTenantContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new AppError(
      "DATABASE_ERROR",
      "Falha ao consultar responsáveis.",
      error,
    );
  }
  return data;
}
