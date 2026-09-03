import { describe, expect, it } from "vitest";
import { resolveAccessRedirect } from "@/lib/auth/resolve-access";
import type { Organization, Profile } from "@/lib/auth/get-current-profile";

const profile: Profile = {
  id: "user-1",
  organization_id: "org-1",
  name: "User",
  email: "user@qarvon.com",
  role: "SALES",
  active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const organization: Organization = {
  id: "org-1",
  name: "Qarvon",
  timezone: "America/Sao_Paulo",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("resolveAccessRedirect", () => {
  it("redireciona usuário não autenticado para /login", () => {
    expect(resolveAccessRedirect({ status: "unauthenticated" })).toBe(
      "/login",
    );
  });

  it("redireciona usuário sem profile vinculado para /sem-acesso", () => {
    expect(resolveAccessRedirect({ status: "no-profile" })).toBe(
      "/sem-acesso",
    );
  });

  it("redireciona profile inativo para /sem-acesso", () => {
    expect(
      resolveAccessRedirect({
        status: "inactive",
        profile: { ...profile, active: false },
      }),
    ).toBe("/sem-acesso");
  });

  it("libera acesso (sem redirect) para profile ativo e vinculado", () => {
    expect(
      resolveAccessRedirect({ status: "authorized", profile, organization }),
    ).toBeNull();
  });
});
