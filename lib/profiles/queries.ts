import { createClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/lib/auth/tenant-context";
import { AppError } from "@/lib/errors";

export interface ProfileOption {
  id: string;
  name: string;
  active: boolean;
}

export interface ListOrganizationProfilesOptions {
  includeInactive?: boolean;
}

// Lista mínima para seletores (ex.: "Responsável" no cadastro/edição de
// lead): só id/name/active, só da organização atual. RLS normal — sem
// service role. organization_id sempre do contexto do servidor.
//
// Por padrão só profiles ativos (cadastro de lead novo não deve oferecer
// um responsável inativo). Na edição de um lead que já tem um responsável
// que depois ficou inativo, includeInactive garante que esse profile
// ainda apareça como opção — sem isso o formulário perderia o valor atual
// silenciosamente.
export async function listOrganizationProfiles(
  options: ListOrganizationProfilesOptions = {},
): Promise<ProfileOption[]> {
  const { organizationId } = await getTenantContext();
  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select("id, name, active")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (!options.includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new AppError(
      "DATABASE_ERROR",
      "Falha ao consultar responsáveis.",
      error,
    );
  }
  return data;
}
