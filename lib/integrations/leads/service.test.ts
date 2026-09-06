import { describe, expect, it } from "vitest";
import {
  createLeadFromIntegration,
  LeadIntakeError,
  type CreateLeadFromIntegrationClient,
} from "@/lib/integrations/leads/service";
import { leadIntakeSchema } from "@/lib/integrations/leads/schema";

type RpcResponse = Awaited<ReturnType<CreateLeadFromIntegrationClient["rpc"]>>;

function fakeRpcClient(response: RpcResponse) {
  const calls: unknown[] = [];
  const client: CreateLeadFromIntegrationClient = {
    rpc: async (_fn, args) => {
      calls.push(args);
      return response;
    },
  };
  return { client, calls };
}

const BASE_INPUT = leadIntakeSchema.parse({
  external_submission_id: "sub-001",
  name: "Maria Teste",
  whatsapp: "(11) 91234-5678",
});

describe("createLeadFromIntegration", () => {
  it("chama a RPC com os parâmetros corretos e mapeia o resultado (lead novo)", async () => {
    const { client, calls } = fakeRpcClient({
      data: [
        {
          lead_id: "lead-1",
          submission_id: "sub-1",
          is_new_lead: true,
          duplicate_submission: false,
        },
      ],
      error: null,
    });

    const result = await createLeadFromIntegration(
      client,
      "cred-1",
      BASE_INPUT,
      { raw: true },
    );

    expect(result).toEqual({
      leadId: "lead-1",
      submissionId: "sub-1",
      isNewLead: true,
      duplicateSubmission: false,
    });
    expect(calls[0]).toMatchObject({
      p_integration_credential_id: "cred-1",
      p_external_submission_id: "sub-001",
      p_lead: { name: "Maria Teste", whatsapp: "(11) 91234-5678" },
      p_attribution: {},
      p_raw_payload: { raw: true },
    });
  });

  it("mapeia corretamente um resultado de retorno (is_new_lead = false)", async () => {
    const { client } = fakeRpcClient({
      data: [
        {
          lead_id: "lead-1",
          submission_id: "sub-2",
          is_new_lead: false,
          duplicate_submission: false,
        },
      ],
      error: null,
    });

    const result = await createLeadFromIntegration(client, "cred-1", BASE_INPUT, {});
    expect(result.isNewLead).toBe(false);
    expect(result.duplicateSubmission).toBe(false);
  });

  it("mapeia corretamente um replay idempotente (duplicate_submission = true)", async () => {
    const { client } = fakeRpcClient({
      data: [
        {
          lead_id: "lead-1",
          submission_id: "sub-1",
          is_new_lead: true,
          duplicate_submission: true,
        },
      ],
      error: null,
    });

    const result = await createLeadFromIntegration(client, "cred-1", BASE_INPUT, {});
    expect(result.duplicateSubmission).toBe(true);
  });

  it("omite company/revenue_range/invests_paid_traffic de p_lead quando não informados", async () => {
    const { client, calls } = fakeRpcClient({
      data: [
        { lead_id: "l", submission_id: "s", is_new_lead: true, duplicate_submission: false },
      ],
      error: null,
    });

    await createLeadFromIntegration(client, "cred-1", BASE_INPUT, {});

    expect(calls[0]).toMatchObject({
      p_lead: { name: "Maria Teste", whatsapp: "(11) 91234-5678" },
    });
    const leadPayload = (calls[0] as { p_lead: Record<string, unknown> }).p_lead;
    expect(leadPayload).not.toHaveProperty("company");
    expect(leadPayload).not.toHaveProperty("revenue_range");
    expect(leadPayload).not.toHaveProperty("invests_paid_traffic");
  });

  it("inclui company/revenue_range/invests_paid_traffic em p_lead quando informados", async () => {
    const input = leadIntakeSchema.parse({
      ...BASE_INPUT,
      company: "Loja Teste",
      revenue_range: "100k_500k",
      invests_paid_traffic: true,
    });
    const { client, calls } = fakeRpcClient({
      data: [
        { lead_id: "l", submission_id: "s", is_new_lead: true, duplicate_submission: false },
      ],
      error: null,
    });

    await createLeadFromIntegration(client, "cred-1", input, {});

    expect(calls[0]).toMatchObject({
      p_lead: {
        name: "Maria Teste",
        whatsapp: "(11) 91234-5678",
        company: "Loja Teste",
        revenue_range: "100k_500k",
        invests_paid_traffic: true,
      },
    });
  });

  it("repassa a atribuição informada em p_attribution", async () => {
    const input = leadIntakeSchema.parse({
      ...BASE_INPUT,
      attribution: { utm_source: "meta", gclid: "abc123" },
    });
    const { client, calls } = fakeRpcClient({
      data: [
        { lead_id: "l", submission_id: "s", is_new_lead: true, duplicate_submission: false },
      ],
      error: null,
    });

    await createLeadFromIntegration(client, "cred-1", input, {});

    expect(calls[0]).toMatchObject({
      p_attribution: { utm_source: "meta", gclid: "abc123" },
    });
  });

  it("lança LeadIntakeError quando a RPC retorna erro", async () => {
    const { client } = fakeRpcClient({
      data: null,
      error: { message: "QARVON_INVALID_WHATSAPP" },
    });

    await expect(
      createLeadFromIntegration(client, "cred-1", BASE_INPUT, {}),
    ).rejects.toBeInstanceOf(LeadIntakeError);
  });

  it("a LeadIntakeError carrega o marcador QARVON_* na própria mensagem", async () => {
    const { client } = fakeRpcClient({
      data: null,
      error: { message: "QARVON_INVALID_WHATSAPP" },
    });

    await expect(
      createLeadFromIntegration(client, "cred-1", BASE_INPUT, {}),
    ).rejects.toMatchObject({ message: "QARVON_INVALID_WHATSAPP" });
  });

  it("lança LeadIntakeError quando a RPC não retorna nenhuma linha", async () => {
    const { client } = fakeRpcClient({ data: [], error: null });

    await expect(
      createLeadFromIntegration(client, "cred-1", BASE_INPUT, {}),
    ).rejects.toBeInstanceOf(LeadIntakeError);
  });
});
