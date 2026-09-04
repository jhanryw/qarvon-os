import { describe, expect, it, vi, beforeEach } from "vitest";

const { getTenantContext } = vi.hoisted(() => ({ getTenantContext: vi.fn() }));
vi.mock("@/lib/auth/tenant-context", () => ({ getTenantContext }));

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { createLead, updateLead } = await import("@/lib/leads/mutations");

type FakeResponse = { data: unknown; error: unknown };

// Fake mínimo e específico para os padrões de query usados em mutations.ts
// (não é um mock genérico de Postgres) — cada chamada terminal
// (maybeSingle/single) consome a próxima resposta da fila, na ordem exata
// em que o código sob teste as invoca. insert()/update() gravam o payload
// recebido em `calls`, para verificar o que o código realmente enviou (não
// só o que o fake decide devolver).
function fakeSupabase(responses: FakeResponse[]) {
  let cursor = 0;
  const calls: { insert: unknown[]; update: unknown[] } = {
    insert: [],
    update: [],
  };
  const next = () => {
    const response = responses[cursor];
    cursor += 1;
    return Promise.resolve(response ?? { data: null, error: null });
  };
  const chain = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    limit: () => chain,
    insert: (payload: unknown) => {
      calls.insert.push(payload);
      return chain;
    },
    update: (payload: unknown) => {
      calls.update.push(payload);
      return chain;
    },
    maybeSingle: next,
    single: next,
  };
  return { client: { from: () => chain }, calls };
}

const TENANT = { organizationId: "org-1" };
const VALID_OWNER_ID = "11111111-1111-4111-8111-111111111111";
const VALID_SOURCE_ID = "22222222-2222-4222-8222-222222222222";
const LEAD_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  getTenantContext.mockReset();
  createClient.mockReset();
  getTenantContext.mockResolvedValue(TENANT);
});

describe("createLead", () => {
  it("cria um lead válido sem owner/source/whatsapp", async () => {
    const fake = fakeSupabase([
      { data: { id: LEAD_ID, name: "Lead Teste" }, error: null }, // insert
    ]);
    createClient.mockResolvedValue(fake.client);

    const result = await createLead({ name: "Lead Teste" });
    expect(result).toEqual({ id: LEAD_ID, name: "Lead Teste" });
    expect(fake.calls.insert[0]).toMatchObject({
      organization_id: "org-1",
      name: "Lead Teste",
    });
  });

  it("rejeita owner de outra organização", async () => {
    const fake = fakeSupabase([
      { data: null, error: null }, // owner check: não encontrado no tenant
    ]);
    createClient.mockResolvedValue(fake.client);

    await expect(
      createLead({ name: "Lead Teste", ownerId: VALID_OWNER_ID }),
    ).rejects.toMatchObject({ code: "INVALID_OWNER" });
  });

  it("rejeita lead_source de outra organização", async () => {
    const fake = fakeSupabase([
      { data: null, error: null }, // source check: não encontrada no tenant
    ]);
    createClient.mockResolvedValue(fake.client);

    await expect(
      createLead({ name: "Lead Teste", leadSourceId: VALID_SOURCE_ID }),
    ).rejects.toMatchObject({ code: "INVALID_LEAD_SOURCE" });
  });

  it("rejeita lead_source inativa para lead novo", async () => {
    const fake = fakeSupabase([
      { data: { id: VALID_SOURCE_ID, active: false }, error: null },
    ]);
    createClient.mockResolvedValue(fake.client);

    await expect(
      createLead({ name: "Lead Teste", leadSourceId: VALID_SOURCE_ID }),
    ).rejects.toMatchObject({ code: "INVALID_LEAD_SOURCE" });
  });

  it("identifica WhatsApp duplicado no mesmo tenant", async () => {
    const fake = fakeSupabase([
      { data: { id: "outro-lead" }, error: null }, // duplicate check: já existe
    ]);
    createClient.mockResolvedValue(fake.client);

    await expect(
      createLead({ name: "Lead Teste", whatsapp: "84999999999" }),
    ).rejects.toMatchObject({ code: "DUPLICATE_WHATSAPP" });
  });

  it("permite criar quando owner e source são válidos e ativos", async () => {
    const fake = fakeSupabase([
      { data: { id: VALID_OWNER_ID }, error: null }, // owner ok
      { data: { id: VALID_SOURCE_ID, active: true }, error: null }, // source ok
      { data: { id: LEAD_ID, name: "Lead Teste" }, error: null }, // insert
    ]);
    createClient.mockResolvedValue(fake.client);

    const result = await createLead({
      name: "Lead Teste",
      ownerId: VALID_OWNER_ID,
      leadSourceId: VALID_SOURCE_ID,
    });
    expect(result).toMatchObject({ id: LEAD_ID });
  });

  it("propaga erro real de banco como DATABASE_ERROR, sem mascarar", async () => {
    const fake = fakeSupabase([
      { data: null, error: { message: "connection refused" } }, // insert falha
    ]);
    createClient.mockResolvedValue(fake.client);

    await expect(createLead({ name: "Lead Teste" })).rejects.toMatchObject({
      code: "DATABASE_ERROR",
    });
  });
});

describe("updateLead", () => {
  it("não aceita organization_id no input (rejeitado pelo schema)", async () => {
    await expect(
      updateLead(LEAD_ID, {
        organization_id: "outra-org",
      }),
    ).rejects.toThrow();
  });

  it("retorna NOT_FOUND quando o lead não pertence ao tenant atual", async () => {
    const fake = fakeSupabase([
      { data: null, error: null }, // existence check: não encontrado
    ]);
    createClient.mockResolvedValue(fake.client);

    await expect(
      updateLead(LEAD_ID, { note: "Editado" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("ignora o próprio lead na checagem de WhatsApp duplicado", async () => {
    const fake = fakeSupabase([
      { data: { id: LEAD_ID }, error: null }, // existence check: ok
      { data: null, error: null }, // duplicate check (excluindo o próprio id): nenhum outro
      { data: { id: LEAD_ID, whatsapp: "5584999999999" }, error: null }, // update
    ]);
    createClient.mockResolvedValue(fake.client);

    const result = await updateLead(LEAD_ID, { whatsapp: "84999999999" });
    expect(result).toMatchObject({ id: LEAD_ID });
    expect(fake.calls.update[0]).toEqual({ whatsapp: "5584999999999" });
  });

  it("aplica normalização nos campos alterados e não toca nos demais", async () => {
    const fake = fakeSupabase([
      { data: { id: LEAD_ID }, error: null }, // existence check
      { data: { id: LEAD_ID, email: "novo@qarvon.com" }, error: null }, // update
    ]);
    createClient.mockResolvedValue(fake.client);

    await updateLead(LEAD_ID, { email: "  Novo@Qarvon.COM  " });
    expect(fake.calls.update[0]).toEqual({ email: "novo@qarvon.com" });
  });
});
