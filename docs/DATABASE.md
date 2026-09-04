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

## M1.1 — Schema de Leads (implementado)

Conforme `docs/PRODUCT.md` §2-3. `pipeline_id`/`stage_id` ficam
exclusivamente para o M2 — não antecipados aqui.

### lead_sources

- `id` uuid PK
- `organization_id` uuid FK → `organizations.id`
- `name` text, único por organização (`organization_id, name`)
- `active` boolean, default `true` (desativar sem apagar; sem DELETE)
- `created_at`, `updated_at` timestamptz
- `UNIQUE (id, organization_id)`: alvo da FK composta de `leads.lead_source_id`

### leads

- `id` uuid PK, `organization_id` uuid FK → `organizations.id`
- `name` (obrigatório), `whatsapp`, `company`, `lead_source_id`, `owner_id`, `note`
- `email`, `instagram`, `website`, `segment`, `city`, `state`,
  `service_interest`, `estimated_value` (`numeric(14,2)`, nunca negativo),
  `campaign`, `revenue_range`, `temperature` (enum `lead_temperature`:
  `COLD`/`WARM`/`HOT`), `next_action`, `next_action_at`
- `created_at`, `updated_at` timestamptz

`owner_id` → FK composta `(owner_id, organization_id)` → `profiles (id,
organization_id)`; `lead_source_id` → FK composta `(lead_source_id,
organization_id)` → `lead_sources (id, organization_id)`. Isso torna
impossível, no banco, um lead referenciar owner ou origem de outra
organização — não depende só de RLS.

Sem DELETE em nenhuma das duas tabelas (RLS sem policy de delete): leads
nunca são excluídos, `lead_sources` se desativa via `active = false`.

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
