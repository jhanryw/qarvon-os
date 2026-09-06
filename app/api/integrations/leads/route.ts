import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  extractBearerToken,
  resolveIntegrationCredential,
  type CredentialLookupClient,
} from "@/lib/integrations/leads/auth";
import { leadIntakeSchema } from "@/lib/integrations/leads/schema";
import {
  createLeadFromIntegration,
  LeadIntakeError,
  type CreateLeadFromIntegrationClient,
} from "@/lib/integrations/leads/service";
import { dispatchDomainEvent } from "@/lib/events/dispatch";

// types/database.ts é gerado a partir do schema real e ainda não conhece
// integration_credentials/create_lead_from_integration (migrations
// 20260906090400/090700, não aplicadas em nenhum ambiente ainda) — o client
// tipado contra ele não satisfaz estruturalmente as interfaces mínimas
// usadas por auth.ts/service.ts. O cast é seguro (mesmo client real, só uma
// visão mais estreita dele) e deixa de ser necessário assim que os tipos
// forem regenerados contra uma instância com as migrations aplicadas.
type IntegrationSupabaseClient = CredentialLookupClient & CreateLeadFromIntegrationClient;

// Endpoint server-to-server para a LP pública (e futuras integrações)
// criarem leads sem sessão humana. Autenticado por Bearer token (hash
// comparado no banco), nunca por chave do Supabase — a service role usada
// abaixo nunca sai deste processo.
//
// Uso do client admin restrito de propósito a exatamente duas operações:
// (1) resolver a credencial pelo hash do token, (2) chamar a RPC
// create_lead_from_integration. Nunca fazer outra query direta em tabela
// com este client neste arquivo — service role ignora RLS por completo, o
// escopo de uso aqui é uma convenção de código, não algo que o Postgres
// force sozinho.
export async function POST(request: Request) {
  const pepper = process.env.INTEGRATION_TOKEN_PEPPER;
  if (!pepper) {
    console.error(
      "POST /api/integrations/leads: INTEGRATION_TOKEN_PEPPER não configurado",
    );
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }

  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) {
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const supabase = createAdminClient() as unknown as IntegrationSupabaseClient;

  const credential = await resolveIntegrationCredential(supabase, token, pepper);
  if (!credential) {
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "VALIDATION_ERROR",
        issues: [{ message: "corpo da requisição não é JSON válido" }],
      },
      { status: 422 },
    );
  }

  const parsed = leadIntakeSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "VALIDATION_ERROR",
        issues: parsed.error.issues,
      },
      { status: 422 },
    );
  }

  let result;
  try {
    result = await createLeadFromIntegration(
      supabase,
      credential.id,
      parsed.data,
      rawBody,
    );
  } catch (error) {
    // QARVON_INVALID_WHATSAPP é o único marcador que representa um erro de
    // ENTRADA que sobrevive à validação Zod (o schema não valida formato de
    // telefone, só tamanho) — mapeado para 422, não 500, porque é algo que
    // a LP pode corrigir reenviando. Qualquer outro marcador (ex.:
    // QARVON_INVALID_CREDENTIAL, que não deveria ser alcançável aqui já que
    // a credencial acabou de ser validada acima) indica uma inconsistência
    // interna, não um erro do chamador — vira 500 genérico, sem detalhe.
    if (error instanceof LeadIntakeError && error.message === "QARVON_INVALID_WHATSAPP") {
      return NextResponse.json(
        {
          success: false,
          error: "VALIDATION_ERROR",
          issues: [{ message: "whatsapp em formato irreconhecível" }],
        },
        { status: 422 },
      );
    }

    console.error("POST /api/integrations/leads: erro inesperado", error);
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }

  // Aguardado (await) dentro de try/catch, ANTES da resposta ser construída
  // — nunca depois de um `return` (ver lib/events/dispatch.ts). Falha aqui
  // nunca vira erro para a LP: o lead já está commitado neste ponto.
  try {
    await dispatchDomainEvent(
      result.isNewLead ? "lead.created" : "lead.returned",
      {
        leadId: result.leadId,
        submissionId: result.submissionId,
        isNewLead: result.isNewLead,
        occurredAt: new Date().toISOString(),
      },
    );
  } catch (dispatchError) {
    console.error(
      "POST /api/integrations/leads: dispatch de evento falhou",
      dispatchError,
    );
  }

  // Replay idempotente é sempre 200, mesmo que a submissão original tenha
  // criado um lead novo (is_new_lead reflete o processamento ORIGINAL, não
  // o que aconteceu agora — que foi nada). Nem retorno nem replay são
  // modelados como erro (ver docs da decisão de contrato): os dois são
  // desfechos válidos do ponto de vista de quem chama.
  const status = result.duplicateSubmission ? 200 : result.isNewLead ? 201 : 200;

  return NextResponse.json(
    {
      success: true,
      lead_id: result.leadId,
      submission_id: result.submissionId,
      is_new_lead: result.isNewLead,
      duplicate_submission: result.duplicateSubmission,
    },
    { status },
  );
}
