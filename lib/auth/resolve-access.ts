import type { CurrentUser } from "@/lib/auth/get-current-profile";

// Regra única de autorização de acesso à área autenticada.
// Usada pelo layout (app) — mantém a decisão em um só lugar, testável sem Supabase.
export function resolveAccessRedirect(user: CurrentUser): string | null {
  switch (user.status) {
    case "unauthenticated":
      return "/login";
    case "no-profile":
    case "inactive":
      return "/sem-acesso";
    case "authorized":
      return null;
  }
}
