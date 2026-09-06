// @vitest-environment node
//
// Teste dedicado de concorrência real para create_lead_from_integration
// (migration 20260906090700, ainda não aplicada em nenhum ambiente no
// momento em que este arquivo foi escrito). Prova o cenário que pgTAP não
// consegue expressar (uma sessão só, sequencial): duas conexões reais
// disputando a mesma advisory lock ao mesmo tempo.
//
// NUNCA roda como teste de unidade — precisa de uma instância Supabase
// self-hosted real, alcançável, com as migrations 20260906090000..090800 já
// aplicadas (a migration 2, o CHECK de revenue_range, é irrelevante aqui:
// nada neste teste toca revenue_range). Pula silenciosamente sem
// NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY configurados, para
// não quebrar `npm run test` em nenhum ambiente sem instância real —
// inclusive o ambiente onde este arquivo foi escrito, que não tem nenhuma
// das duas variáveis disponíveis.
//
// Cliente Supabase SEM o generic <Database> de propósito (não reaproveita
// createAdminClient()): types/database.ts é gerado a partir do schema real
// e ainda não conhece pipelines/pipeline_stages/integration_credentials/
// lead_submissions/lead_attribution/create_lead_from_integration nem as
// colunas novas de leads — tipar estritamente contra ele quebraria
// `tsc --noEmit` do projeto inteiro até alguém regenerar os tipos contra uma
// instância real com as migrations aplicadas (passo já documentado como
// pendente). Regenerar os tipos depois torna este arquivo elegível para
// voltar a usar createAdminClient() normalmente, se desejado.
//
// `// @vitest-environment node` (não jsdom, o default do projeto): este
// teste faz chamadas de rede reais via fetch; jsdom define `window`
// globalmente e não agrega nenhum valor aqui.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const hasLiveInstance = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// createClient() só é chamado dentro de beforeAll, nunca no corpo do
// describe: describe.skipIf ainda EXECUTA o corpo da suíte durante a coleta
// de testes (só pula a execução dos testes em si) — construir o client ali
// fora, sem as env vars presentes, derrubaria a coleta inteira com um erro
// em vez de simplesmente pular.
describe.skipIf(!hasLiveInstance)(
  "create_lead_from_integration — concorrência real (2 conexões)",
  () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let supabase: any;

    const organizationId = randomUUID();
    const pipelineId = randomUUID();
    const stageId = randomUUID();
    const leadSourceId = randomUUID();
    const credentialId = randomUUID();
    const rawWhatsapp = "(11) 90000-0000";
    const normalizedWhatsapp = "+5511900000000";

    beforeAll(async () => {
      supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );

      await supabase
        .from("organizations")
        .insert({ id: organizationId, name: `Teste Concorrência ${organizationId}` });
      await supabase.from("pipelines").insert({
        id: pipelineId,
        organization_id: organizationId,
        name: "Pipeline Teste Concorrência",
        is_default: true,
        active: true,
      });
      await supabase.from("pipeline_stages").insert({
        id: stageId,
        organization_id: organizationId,
        pipeline_id: pipelineId,
        name: "Novo Lead",
        position: 1,
        probability: 5,
        stage_type: "OPEN",
        active: true,
      });
      await supabase.from("lead_sources").insert({
        id: leadSourceId,
        organization_id: organizationId,
        name: "Fonte Teste Concorrência",
        active: true,
      });
      await supabase.from("integration_credentials").insert({
        id: credentialId,
        organization_id: organizationId,
        slug: `concurrency-test-${credentialId}`,
        token_hash: `hash-${credentialId}`,
        default_lead_source_id: leadSourceId,
        active: true,
      });
    });

    afterAll(async () => {
      if (!supabase) return;
      // Ordem inversa das FKs.
      await supabase.from("lead_attribution").delete().eq("organization_id", organizationId);
      await supabase.from("lead_submissions").delete().eq("organization_id", organizationId);
      await supabase.from("lead_stage_history").delete().eq("organization_id", organizationId);
      await supabase.from("leads").delete().eq("organization_id", organizationId);
      await supabase.from("integration_credentials").delete().eq("id", credentialId);
      await supabase.from("lead_sources").delete().eq("id", leadSourceId);
      await supabase.from("pipeline_stages").delete().eq("id", stageId);
      await supabase.from("pipelines").delete().eq("id", pipelineId);
      await supabase.from("organizations").delete().eq("id", organizationId);
    });

    it(
      "duas submissões simultâneas do mesmo WhatsApp, com external_submission_id " +
        "diferentes, resultam em exatamente 1 lead OPEN, 2 lead_submissions e " +
        "2 lead_attribution — nunca 2 leads",
      async () => {
        const [resultA, resultB] = await Promise.all([
          supabase.rpc("create_lead_from_integration", {
            p_integration_credential_id: credentialId,
            p_external_submission_id: `concurrency-a-${randomUUID()}`,
            p_lead: { name: "Lead Concorrente A", whatsapp: rawWhatsapp },
            p_attribution: {},
            p_raw_payload: {},
          }),
          supabase.rpc("create_lead_from_integration", {
            p_integration_credential_id: credentialId,
            p_external_submission_id: `concurrency-b-${randomUUID()}`,
            p_lead: { name: "Lead Concorrente B", whatsapp: rawWhatsapp },
            p_attribution: {},
            p_raw_payload: {},
          }),
        ]);

        expect(resultA.error).toBeNull();
        expect(resultB.error).toBeNull();

        const rowA = resultA.data?.[0];
        const rowB = resultB.data?.[0];

        // A advisory lock serializou a decisão: uma das duas chamadas
        // decidiu "novo", a outra "retorno" — nunca as duas "novo" ao
        // mesmo tempo (que seria o bug que este teste existe para pegar).
        const isNewFlags = [rowA?.is_new_lead, rowB?.is_new_lead].sort();
        expect(isNewFlags).toEqual([false, true]);

        // Convergem para o mesmo lead.
        expect(rowA?.lead_id).toBe(rowB?.lead_id);

        const { data: matchingLeads, error: leadsError } = await supabase
          .from("leads")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("whatsapp_normalized", normalizedWhatsapp);
        expect(leadsError).toBeNull();
        expect(matchingLeads).toHaveLength(1);

        const { data: submissions, error: submissionsError } = await supabase
          .from("lead_submissions")
          .select("id")
          .eq("lead_id", rowA?.lead_id);
        expect(submissionsError).toBeNull();
        expect(submissions).toHaveLength(2);

        const submissionIds = (submissions ?? []).map((row: { id: string }) => row.id);
        const { data: attributions, error: attributionsError } = await supabase
          .from("lead_attribution")
          .select("id")
          .in("submission_id", submissionIds);
        expect(attributionsError).toBeNull();
        expect(attributions).toHaveLength(2);
      },
    );
  },
);
