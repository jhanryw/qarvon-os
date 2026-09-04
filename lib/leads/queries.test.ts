import { beforeEach, describe, expect, it, vi } from "vitest";
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

const { listLeads } = await import("@/lib/leads/queries");

// Fake mínimo para listLeads: cada chamada terminal é o próprio objeto
// (thenable), já que o código faz `await query` diretamente (sem
// maybeSingle/single). Registra table + eq/is chamados na tabela "leads"
// para verificar que organization_id e filtros viram os métodos certos, e
// conta chamadas por tabela para provar ausência de N+1.
function fakeSupabaseForListLeads(config: {
  leads: { data: unknown[]; error: unknown; count: number | null };
  profiles?: { data: unknown[]; error: unknown };
  leadSources?: { data: unknown[]; error: unknown };
}) {
  const fromCalls: string[] = [];
  const leadsFilterCalls: Array<{ method: string; args: unknown[] }> = [];

  function makeChain(result: unknown, trackFilters: boolean) {
    const chain = {
      select: () => chain,
      order: () => chain,
      range: () => chain,
      or: () => chain,
      not: () => chain,
      in: () => chain,
      eq: (...args: unknown[]) => {
        if (trackFilters) leadsFilterCalls.push({ method: "eq", args });
        return chain;
      },
      is: (...args: unknown[]) => {
        if (trackFilters) leadsFilterCalls.push({ method: "is", args });
        return chain;
      },
      then: (resolve: (value: unknown) => void) =>
        Promise.resolve(result).then(resolve),
    };
    return chain;
  }

  return {
    fromCalls,
    leadsFilterCalls,
    client: {
      from: (table: string) => {
        fromCalls.push(table);
        if (table === "leads") return makeChain(config.leads, true);
        if (table === "profiles")
          return makeChain(config.profiles ?? { data: [], error: null }, false);
        if (table === "lead_sources")
          return makeChain(
            config.leadSources ?? { data: [], error: null },
            false,
          );
        return makeChain({ data: [], error: null }, false);
      },
    },
  };
}

const ORG_ID = "org-1";
const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const SOURCE_A = "33333333-3333-4333-8333-333333333333";

describe("listLeads", () => {
  beforeEach(() => {
    getTenantContext.mockReset();
    createClient.mockReset();
    getTenantContext.mockResolvedValue({ organizationId: ORG_ID });
  });

  it("resolve owner/lead_source em no máximo 1 consulta por tabela, mesmo com várias linhas repetindo ids", async () => {
    const fake = fakeSupabaseForListLeads({
      leads: {
        data: [
          {
            id: "lead-1",
            owner_id: OWNER_A,
            lead_source_id: SOURCE_A,
            name: "Lead 1",
          },
          {
            id: "lead-2",
            owner_id: OWNER_A,
            lead_source_id: SOURCE_A,
            name: "Lead 2",
          },
          {
            id: "lead-3",
            owner_id: OWNER_B,
            lead_source_id: null,
            name: "Lead 3",
          },
        ],
        error: null,
        count: 3,
      },
      profiles: {
        data: [
          { id: OWNER_A, name: "Owner A" },
          { id: OWNER_B, name: "Owner B" },
        ],
        error: null,
      },
      leadSources: {
        data: [{ id: SOURCE_A, name: "Source A" }],
        error: null,
      },
    });
    createClient.mockResolvedValue(fake.client);

    const result = await listLeads();

    // 1x leads + 1x profiles + 1x lead_sources = 3 chamadas totais, nunca
    // uma por linha (o que daria 1 + 3 + 3 = 7 para este caso).
    expect(fake.fromCalls.filter((t) => t === "profiles")).toHaveLength(1);
    expect(fake.fromCalls.filter((t) => t === "lead_sources")).toHaveLength(1);

    expect(result.leads[0]).toMatchObject({
      ownerName: "Owner A",
      leadSourceName: "Source A",
    });
    expect(result.leads[2]).toMatchObject({
      ownerName: "Owner B",
      leadSourceName: null,
    });
  });

  it("não consulta profiles/lead_sources quando a página não tem owner/source", async () => {
    const fake = fakeSupabaseForListLeads({
      leads: {
        data: [{ id: "lead-1", owner_id: null, lead_source_id: null, name: "Lead" }],
        error: null,
        count: 1,
      },
    });
    createClient.mockResolvedValue(fake.client);

    await listLeads();

    expect(fake.fromCalls).not.toContain("profiles");
    expect(fake.fromCalls).not.toContain("lead_sources");
  });

  it('filtro ownerId="none" usa .is(owner_id, null) em vez de .eq', async () => {
    const fake = fakeSupabaseForListLeads({
      leads: { data: [], error: null, count: 0 },
    });
    createClient.mockResolvedValue(fake.client);

    await listLeads({ ownerId: "none" });

    const ownerFilter = fake.leadsFilterCalls.find(
      (call) => call.args[0] === "owner_id",
    );
    expect(ownerFilter?.method).toBe("is");
    expect(ownerFilter?.args).toEqual(["owner_id", null]);
  });

  it("sempre escopa a query por organization_id do contexto do tenant", async () => {
    const fake = fakeSupabaseForListLeads({
      leads: { data: [], error: null, count: 0 },
    });
    createClient.mockResolvedValue(fake.client);

    await listLeads();

    const orgFilter = fake.leadsFilterCalls.find(
      (call) => call.args[0] === "organization_id",
    );
    expect(orgFilter?.args).toEqual(["organization_id", ORG_ID]);
  });

  it("propaga erro real de banco como DATABASE_ERROR", async () => {
    const fake = fakeSupabaseForListLeads({
      leads: { data: [], error: { message: "connection refused" }, count: null },
    });
    createClient.mockResolvedValue(fake.client);

    await expect(listLeads()).rejects.toMatchObject({
      code: "DATABASE_ERROR",
    });
  });
});
