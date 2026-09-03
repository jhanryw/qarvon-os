# Qarvon OS — Roadmap

O desenvolvimento deve ocorrer incrementalmente.

Não iniciar milestone seguinte antes que a anterior esteja funcional e validada.

---

# M0 — Fundação

Objetivo:

criar base técnica confiável.

Entregas:

- projeto Next.js
- Supabase Qarvon
- configuração ambiente
- migrations
- organizations
- auth
- profiles
- roles
- RLS
- layout
- sidebar
- tratamento básico de erros
- testes básicos
- CI/typecheck se aplicável

Critério de conclusão:

usuário autenticado consegue acessar somente organização autorizada.

---

# M1 — Leads

Objetivo:

permitir entrada e consulta de leads.

Entregas:

- pipelines
- pipeline_stages
- lead_sources
- leads
- formulário rápido
- edição
- listagem
- pesquisa
- filtros básicos

Critério:

lead pode ser cadastrado em poucos segundos e localizado facilmente.

---

# M2 — Pipeline

Objetivo:

operar comercial visualmente.

Entregas:

- Kanban
- drag and drop
- mudança de estágio
- histórico
- tempo no estágio
- filtros

Critério:

toda mudança gera histórico correto.

---

# M3 — Atividades

Entregas:

- timeline
- ligações
- WhatsApp
- reunião
- observação
- follow-up
- proposta
- próxima ação

Critério:

é possível entender o histórico comercial sem consultar ferramenta externa.

---

# M4 — Fechamento e perdas

Entregas:

- WON
- LOST
- motivos de perda
- deals
- valores
- recorrência
- responsável
- data de fechamento

Critério:

resultado comercial fica historicamente registrado.

---

# M5 — Metas

Entregas:

- metas mensais
- metas individuais
- receita
- MRR
- vendas
- reuniões
- propostas
- leads

Critério:

dashboard consegue comparar realizado x meta.

---

# M6 — CRM Analytics

Entregas:

- dashboard
- KPIs
- funil
- pipeline
- pipeline ponderado
- origem
- vendedor
- conversões
- lead time
- tempo por estágio
- win/loss
- metas

Critério:

gestão consegue compreender performance comercial pelo Qarvon OS.

---

# CHECKPOINT CRM

Parar desenvolvimento.

Usar CRM na operação real.

Corrigir:

- UX
- dados
- regras
- métricas
- gargalos

Não iniciar expansão desnecessária.

---

# M7 — Clientes e contratos mínimos

Objetivo:

criar ponte CRM → Financeiro.

Não implementar gestão operacional de clientes.

Entregas:

- customers
- contracts
- conversão deal → customer
- contrato
- recorrência
- vencimento

---

# M8 — Estrutura financeira

Entregas:

- contas financeiras
- categorias
- centros de custo
- fornecedores básicos
- contas a receber
- contas a pagar

---

# M9 — Recebimentos e pagamentos

Entregas:

- baixar recebimento
- baixar pagamento
- histórico
- filtros
- vencidos
- próximos vencimentos

Avaliar modelo de transações antes de implementar pagamentos parciais.

---

# M10 — Fluxo de caixa

Entregas:

- saldo
- entradas
- saídas
- realizado
- previsto
- 7 dias
- 30 dias
- 60 dias
- 90 dias

---

# M11 — DRE

Entregas:

- categorias DRE
- competência
- receita
- custos
- despesas
- resultado
- margem

---

# M12 — Dashboard Executivo

Somente após CRM e Financeiro possuírem dados confiáveis.

Possíveis KPIs:

- receita
- MRR
- resultado
- margem
- caixa
- contas a receber
- contas a pagar
- pipeline
- vendas
- meta
- projeções

---

# FUTURO

Fora do roadmap atual:

- gestão de clientes
- projetos
- tarefas
- social media
- mídia
- aprovação
- portal cliente
- RH
- folha
- IA
- automações
- WhatsApp
- Meta Ads
- Google Ads
- billing automatizado
- productização SaaS

Só adicionar após decisão explícita.