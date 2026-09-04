import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/get-current-profile";
import { AppError } from "@/lib/errors";

const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

vi.mock("@/lib/auth/get-current-profile", () => ({ getCurrentUser }));

const { getTenantContext } = await import("@/lib/auth/tenant-context");

const profile = {
  id: "user-1",
  organization_id: "org-1",
  name: "User",
  email: "user@qarvon.com",
  role: "SALES" as const,
  active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const organization = {
  id: "org-1",
  name: "Qarvon",
  timezone: "America/Sao_Paulo",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("getTenantContext", () => {
  it("lança UNAUTHENTICATED quando não há sessão", async () => {
    getCurrentUser.mockResolvedValue({
      status: "unauthenticated",
    } satisfies CurrentUser);

    await expect(getTenantContext()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("lança NO_ACCESS quando não há profile", async () => {
    getCurrentUser.mockResolvedValue({
      status: "no-profile",
    } satisfies CurrentUser);

    await expect(getTenantContext()).rejects.toMatchObject({
      code: "NO_ACCESS",
    });
  });

  it("lança NO_ACCESS quando o profile está inativo", async () => {
    getCurrentUser.mockResolvedValue({
      status: "inactive",
      profile: { ...profile, active: false },
    } satisfies CurrentUser);

    await expect(getTenantContext()).rejects.toBeInstanceOf(AppError);
    await expect(getTenantContext()).rejects.toMatchObject({
      code: "NO_ACCESS",
    });
  });

  it("retorna profile e organizationId quando autorizado", async () => {
    getCurrentUser.mockResolvedValue({
      status: "authorized",
      profile,
      organization,
    } satisfies CurrentUser);

    const ctx = await getTenantContext();
    expect(ctx.organizationId).toBe("org-1");
    expect(ctx.profile.id).toBe("user-1");
  });
});
