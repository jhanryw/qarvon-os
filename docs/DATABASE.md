# Qarvon OS — Database (Schema Conceitual)

Este documento é a fonte de verdade conceitual do banco de dados. Ele não
substitui as migrations (fonte de verdade da estrutura real) nem
`types/database.ts` (fonte de verdade da tipagem TypeScript, gerada a partir
do banco real). Aqui descrevemos entidades e campos conceituais por
milestone, conforme `docs/ROADMAP.md`.

Convenções gerais (ver `docs/ARCHITECTURE.md`):

- PK `uuid` (`gen_random_uuid()`)
- `created_at` / `updated_at` sempre `timestamptz`
- Tabelas de negócio multi-tenant possuem `organization_id` (FK para
  `organizations`), protegido por RLS
- Valores monetários: `numeric`, nunca `float`
- Toda mudança de schema via migration versionada em `supabase/migrations/`
- Mudanças de estágio e eventos de negócio relevantes geram histórico
  (nunca depender apenas do estado atual)

---

## M0 — Fundação (implementado)

Estrutura real em `supabase/migrations/`. Campos abaixo refletem exatamente
o que está migrado.

### organizations

- `id` uuid PK
- `name` text, único
- `timezone` text, default `America/Sao_Paulo`
- `created_at`, `updated_at` timestamptz

### profiles

Relacionada ao usuário autenticado (`auth.users`, 1:1).

- `id` uuid PK (referencia `auth.users.id`)
- `organization_id` uuid FK → `organizations.id`
- `name` text
- `email` text
- `role` enum `user_role` (`ADMIN`, `SALES`)
- `active` boolean, default `true`
- `created_at`, `updated_at` timestamptz

Vínculo `profile` → `organization` é sempre explícito (procedimento
administrativo, ver `supabase/BOOTSTRAP.md`), nunca automático.

---

## M1 — Leads (planejado)

Conforme `docs/PRODUCT.md` §2-3.

### pipelines / pipeline_stages

Pipeline configurável, não hardcoded. Estágio possui: id, nome, ordem,
probabilidade, tipo (`OPEN` | `WON` | `LOST`), ativo.

### lead_sources

Origem do lead (configurável).

### leads

Campos mínimos de criação: nome, telefone/WhatsApp, empresa, origem,
responsável, observação opcional.

Campos adicionais (enriquecimento posterior): email, Instagram, site,
segmento, cidade, estado, serviço de interesse, valor potencial, campanha,
faixa de faturamento, temperatura, próxima ação, data da próxima ação.

Cada lead pertence a uma `organization` e a um estágio de `pipeline_stages`.

---

## M2 — Pipeline (planejado)

Conforme `docs/ARCHITECTURE.md` §10.

### lead_stage_history

Toda mudança de estágio gera histórico (nunca só `stage` atual):

- lead
- estágio anterior
- novo estágio
- usuário responsável pela mudança
- timestamp

Fonte oficial para cálculo de lead time e tempo por estágio
(`docs/METRICS.md`).

---

## M3 — Atividades (planejado)

Conforme `docs/PRODUCT.md` §7.

### activities

Tipos: `CALL`, `WHATSAPP`, `MEETING`, `NOTE`, `EMAIL`, `FOLLOW_UP`,
`PROPOSAL`.

Campos: lead, tipo, responsável, data, descrição, `created_at`.

---

## M4 — Fechamento e perdas (planejado)

Conforme `docs/PRODUCT.md` §8-9.

### deals

Ao fechar (`WON`): data do fechamento, valor vendido, serviço, responsável,
modelo de cobrança, recorrência, duração quando aplicável.

Ao perder (`LOST`): motivo obrigatório (configurável — preço, sem
orçamento, não respondeu, timing, concorrente, não qualificado, desistiu,
outro). Leads perdidos nunca são excluídos.

---

## M5 — Metas (planejado)

Conforme `docs/PRODUCT.md` §10.

### goals

Tipos: `REVENUE`, `NEW_MRR`, `DEALS_WON`, `MEETINGS`, `PROPOSALS`, `LEADS`.

Campos: período, tipo, valor alvo, responsável (opcional — meta coletiva
não possui responsável), organização.

---

## M7 — Clientes e contratos mínimos (planejado)

Conforme `docs/ROADMAP.md` M7. Ponte CRM → Financeiro; não implementa
gestão operacional de clientes.

### customers

Criado a partir da conversão de um `deal` fechado.

### contracts

Recorrência, vencimento, origem no `deal` fechado.

---

## M8 — Estrutura financeira (planejado)

Conforme `docs/PRODUCT.md` §14-16.

### financial_accounts

Nome, tipo, saldo inicial, ativo.

### categories / cost_centers

Categorização de movimentações e centros de custo, usados por contas a
pagar/receber e pela DRE (`docs/METRICS.md` §31).

### receivables (contas a receber)

Cliente/contrato, descrição, competência, vencimento, valor, status
(`PENDING`, `PAID`, `OVERDUE`, `CANCELLED`), conta financeira, data e valor
do recebimento.

### payables (contas a pagar)

Fornecedor, descrição, categoria, centro de custo, competência, vencimento,
valor, status, conta financeira, data e valor do pagamento.

---

## M9 — Recebimentos e pagamentos (planejado)

Baixa de recebimento/pagamento sobre `receivables`/`payables`. Avaliar
modelo de transações antes de implementar pagamentos parciais
(`docs/ARCHITECTURE.md`).

---

## M10 — Fluxo de caixa (planejado)

Separação `REALIZADO` / `PREVISTO` sobre `receivables`/`payables` e
`financial_accounts`. Regime de caixa — nunca misturar com competência
(`docs/METRICS.md` §17, §31).

---

## M11 — DRE (planejado)

Estrutura por `categories`, regime de competência. Receita Bruta → Receita
Líquida → Margem Bruta → Resultado Operacional (`docs/PRODUCT.md` §18).

---

## Fora de escopo atual

Tabelas de gestão operacional de clientes, projetos, tarefas, conteúdo,
mídia, RH, fiscal, estoque — conforme `docs/VISION.md` §1 e
`docs/ROADMAP.md` (seção FUTURO). Não criar sem decisão explícita.
