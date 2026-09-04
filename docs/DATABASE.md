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

Conforme `docs/PRODUCT.md` §2-3. `pipeline_id`/`stage_id` não fazem parte
do schema original de `leads` — foram adicionados por `ALTER TABLE` no
M2.1 (ver seção abaixo), não antecipados aqui.

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

## M2.1 — Schema do Pipeline (implementado)

Somente schema — sem Kanban, sem drag-and-drop, sem mudança de estágio pela
aplicação ainda (isso é M2.2). Conforme `docs/ARCHITECTURE.md` §10.

### pipelines

- `id` uuid PK, `organization_id` uuid FK → `organizations.id`
- `name` text, único por organização (`organization_id, name`)
- `is_default` boolean, `active` boolean (default `true`)
- `created_at`, `updated_at` timestamptz
- `UNIQUE (id, organization_id)`: alvo de FK composta
- Índice único parcial garante **no máximo um** pipeline default ativo por
  organização (`WHERE is_default AND active`) — não "exatamente um"; M2.2
  deve falhar explicitamente se a organização não tiver nenhum

O schema suporta múltiplos pipelines por organização desde já; o produto
usa apenas um ("Pipeline Comercial", seedado) por enquanto.

### pipeline_stages

- `id` uuid PK, `organization_id` uuid, `pipeline_id` uuid — FK composta
  `(pipeline_id, organization_id) → pipelines (id, organization_id)`
  (tenant-safe)
- `name`, `position` integer (> 0, único por pipeline, `DEFERRABLE` para
  suportar reordenação futura), `probability` integer (0-100, nunca float)
- `stage_type` enum `pipeline_stage_type` (`OPEN`/`WON`/`LOST`) — produto,
  não configurável por organização (mesmo padrão de `lead_temperature`); a
  UI nunca decide semântica terminal pelo nome textual da stage
- `active` boolean, `created_at`, `updated_at`
- `UNIQUE (id, organization_id)` e `UNIQUE (id, pipeline_id)`: a segunda é
  o alvo usado por `leads.stage_id` e por
  `lead_stage_history.from_stage_id`/`to_stage_id` para garantir que uma
  stage referenciada sempre pertence ao pipeline correto
- `probability` travado por `stage_type`: WON exige 100, LOST exige 0
- No máximo uma stage WON ativa e uma LOST ativa por pipeline (índices
  únicos parciais) — OPEN sem limite de quantidade
- **`pipeline_id` e `stage_type` são imutáveis após a criação** (trigger):
  mudar qualquer um dos dois reescreveria retroativamente o significado de
  todo histórico que já referencia a stage. Corrigir um cadastro errado
  antes de qualquer uso real é desativar (`active = false`) e criar uma
  stage nova — mesmo padrão de `lead_sources`. `position` e `probability`
  podem ser alterados livremente (respeitando os checks acima)

### leads (alteração)

- `+ pipeline_id uuid`, `+ stage_id uuid`
- FK `(pipeline_id, organization_id) → pipelines (id, organization_id)`
- FK `(stage_id, pipeline_id) → pipeline_stages (id, pipeline_id)` —
  impede fisicamente um lead com `pipeline_id` de um pipeline e `stage_id`
  de outro
- `UNIQUE (id, organization_id)` adicionada (alvo de FK de
  `lead_stage_history.lead_id`)
- **`pipeline_id`/`stage_id` continuam `NULLABLE` neste milestone** —
  compatibilidade temporária de rollout, não uma decisão de domínio:
  `createLead()` (M1) ainda não resolve pipeline/stage default. A
  migration de `NOT NULL` pertence ao fechamento do M2.2, depois que a
  criação transacional (lead + primeiro evento de histórico) estiver
  implementada e homologada

### lead_stage_history

Event log **append-only e imutável** — cada linha é uma transição, nunca um
"intervalo" com data de saída (isso exigiria `UPDATE`, quebrando a
imutabilidade). Tempo por estágio e lead time são derivados por window
function sobre `changed_at` em tempo de consulta (`docs/METRICS.md`), não
armazenados aqui.

- `id`, `organization_id`, `lead_id` (FK composta → `leads`)
- `from_pipeline_id`/`from_stage_id`/`from_position` — nulos apenas no
  evento de criação/bootstrap; os três preenchidos juntos em qualquer
  transição real (`CHECK` garante que não existe combinação parcial)
- `to_pipeline_id`/`to_stage_id`/`to_position` — sempre preenchidos
- `from_*`/`to_*` são separados (em vez de um único `pipeline_id`
  compartilhado) para poder representar uma futura mudança de pipeline
  (Pipeline A/Stage X → Pipeline B/Stage Y) sem redesenho de schema — não
  implementado ainda, só não impossibilitado
- `from_position`/`to_position` são **snapshots** da position no momento
  da transição, nunca a position atual da stage — stages podem ser
  reordenadas depois, e usar a position atual corromperia o cálculo de
  regressão sobre eventos antigos
- `changed_by` (FK → `profiles`, nullable), `changed_at` timestamptz — sem
  `updated_at`: é log imutável, nunca é atualizado

`leads.pipeline_id`/`stage_id` são um **cache do estado atual**, não a
fonte de verdade — `lead_stage_history` é a fonte de verdade (nunca
depender só do estado atual, `docs/ARCHITECTURE.md` §10).

**Escrita restrita**: RLS permite `SELECT` para `authenticated` na própria
organização, mas **não** permite `INSERT`/`UPDATE`/`DELETE` diretos. O
histórico é consequência de uma transição real, não um dado que o client
escreve — um `INSERT` direto exposto ao client deixaria a RLS resolver
isolamento de tenant, mas não a legitimidade do evento (um usuário
poderia fabricar histórico da própria organização sem que
`leads.pipeline_id`/`stage_id` tivesse de fato mudado). A escrita real
será feita pelo M2.2 através de uma função Postgres transacional dedicada
(`SELECT ... FOR UPDATE` no lead → validar destino → `UPDATE leads` →
`INSERT lead_stage_history`, mesma transação) — não implementada ainda.

**Leads legados (backfill)**: os leads que já existiam antes do M2 tiveram
um evento sintético de bootstrap criado por migration, com
`from_* = NULL` e `changed_at` = o timestamp real de execução da
migration — **nunca** `leads.created_at` (não havia pipeline nem
rastreamento de estágio antes disso; usar `created_at` teria falsificado
histórico que nunca existiu). Consequência: para esses leads, "tempo até
WON"/"tempo por stage" medem a partir do bootstrap, não da criação real —
honesto, mas produz tempo-na-primeira-etapa artificialmente curto
comparado a leads criados depois do M2.

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
