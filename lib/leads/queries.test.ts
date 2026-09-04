import { describe, expect, it, vi } from "vitest";
import { computePageRange, escapeIlikeTerm } from "@/lib/leads/queries";

describe("computePageRange", () => {
  it("calcula o range da primeira página", () => {
    expect(computePageRange(1, 20)).toEqual({ from: 0, to: 19 });
  });

  it("calcula o range de páginas subsequentes", () => {
    expect(computePageRange(3, 10)).toEqual({ from: 20, to: 29 });
  });

  it("calcula o range para pageSize diferente de 20", () => {
    expect(computePageRange(2, 5)).toEqual({ from: 5, to: 9 });
  });
});

describe("escapeIlikeTerm", () => {
  it("escapa % para não virar wildcard", () => {
    expect(escapeIlikeTerm("50%")).toBe("50\\%");
  });

  it("escapa _ para não virar wildcard de caractere único", () => {
    expect(escapeIlikeTerm("lead_x")).toBe("lead\\_x");
  });

  it("não altera termo sem caracteres especiais", () => {
    expect(escapeIlikeTerm("acme")).toBe("acme");
  });
});

const { getTenantContext } = vi.hoisted(() => ({ getTenantContext: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getTenantContext }));

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { getLeadById } = await import("@/lib/leads/queries");

function fakeSupabaseReturning(response: { data: unknown; error: unknown }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve(response),
  };
  return { from: () => chain };
}

describe("getLeadById", () => {
  it("retorna NOT_FOUND para um id que não é uuid, sem consultar o banco", async () => {
    await expect(getLeadById("not-a-uuid")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(getTenantContext).not.toHaveBeenCalled();
  });

  it("retorna NOT_FOUND quando o lead não pertence ao tenant atual", async () => {
    getTenantContext.mockResolvedValue({ organizationId: "org-1" });
    createClient.mockResolvedValue(
      fakeSupabaseReturning({ data: null, error: null }),
    );

    await expect(
      getLeadById("11111111-1111-4111-8111-111111111111"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("retorna o lead quando pertence ao tenant atual", async () => {
    getTenantContext.mockResolvedValue({ organizationId: "org-1" });
    const lead = { id: "11111111-1111-4111-8111-111111111111", name: "Lead" };
    createClient.mockResolvedValue(
      fakeSupabaseReturning({ data: lead, error: null }),
    );

    const result = await getLeadById("11111111-1111-4111-8111-111111111111");
    expect(result).toEqual(lead);
  });
});
