# Qarvon OS — Product Specification

# 1. Usuários

Inicialmente o sistema será utilizado internamente pela Qarvon.

Tipos básicos:

ADMIN
SALES

Novos papéis podem ser adicionados posteriormente.

---

# 2. CRM

## 2.1 Lead

Um lead representa uma oportunidade comercial.

Campos mínimos de criação:

- nome
- telefone/WhatsApp
- empresa
- origem
- responsável
- observação opcional

Campos adicionais:

- email
- Instagram
- site
- segmento
- cidade
- estado
- serviço de interesse
- valor potencial
- campanha
- faturamento/faixa de faturamento
- temperatura
- próxima ação
- data da próxima ação

O cadastro inicial deve permanecer rápido.

---

# 3. Pipeline

O pipeline deve ser configurável.

Pipeline inicial sugerido:

1. Novo Lead
2. Contato Iniciado
3. Qualificado
4. Reunião Agendada
5. Reunião Realizada
6. Proposta Enviada
7. Negociação
8. Fechado
9. Perdido

Os estágios não devem ser hardcoded.

Devem possuir:

- id
- nome
- ordem
- probabilidade
- tipo
- ativo

Tipos especiais:

OPEN
WON
LOST

---

# 4. Kanban

O CRM deve possuir visualização Kanban.

Cada card deve mostrar prioritariamente:

- nome
- empresa
- responsável
- valor potencial
- origem
- próxima ação
- tempo no estágio

Mover o card entre colunas deve alterar o estágio e gerar histórico.

---

# 5. Lista

Além do Kanban deve existir visualização em tabela.

Filtros importantes:

- responsável
- estágio
- origem
- período
- serviço
- segmento
- campanha

Pesquisa:

- nome
- empresa
- telefone
- email

---

# 6. Página do lead

A página individual deve concentrar:

## Dados

Informações do lead.

## Oportunidade

- estágio
- responsável
- valor
- serviço
- probabilidade

## Próxima ação

- ação
- data
- responsável

## Timeline

Exibir cronologicamente:

- criação
- mudanças de estágio
- ligações
- mensagens
- reuniões
- observações
- propostas
- fechamento
- perda

---

# 7. Atividades

Tipos iniciais:

CALL
WHATSAPP
MEETING
NOTE
EMAIL
FOLLOW_UP
PROPOSAL

Atividades devem possuir:

- lead
- tipo
- responsável
- data
- descrição
- created_at

---

# 8. Perdas

Ao mover um lead para LOST, exigir motivo.

Motivos devem ser configuráveis.

Exemplos:

- preço
- sem orçamento
- não respondeu
- timing
- concorrente
- não qualificado
- desistiu
- outro

Nunca excluir leads perdidos.

---

# 9. Fechamento

Ao marcar como WON, registrar:

- data do fechamento
- valor vendido
- serviço
- responsável
- modelo de cobrança
- recorrência
- duração quando aplicável

Posteriormente isso originará contrato e financeiro.

---

# 10. Metas

Tipos iniciais:

REVENUE
NEW_MRR
DEALS_WON
MEETINGS
PROPOSALS
LEADS

Meta deve possuir:

- período
- tipo
- valor alvo
- responsável opcional
- organização

Metas coletivas não possuem responsável.

---

# 11. Dashboard CRM

## KPIs principais

- leads recebidos
- leads qualificados
- reuniões
- propostas
- vendas
- receita vendida
- novo MRR
- ticket médio
- conversão geral
- lead time médio
- pipeline aberto
- pipeline ponderado

## Funil

Mostrar:

Leads
Qualificados
Reuniões
Propostas
Fechamentos

Mostrar volume e conversão entre etapas.

## Meta

Mostrar:

- meta
- realizado
- percentual
- restante
- ritmo necessário

## Pipeline

Mostrar:

- quantidade por estágio
- valor por estágio
- pipeline total
- pipeline ponderado

## Origem

Mostrar:

- leads
- vendas
- conversão
- receita
- ticket

por origem.

## Responsável

Mostrar:

- leads
- reuniões
- propostas
- fechamentos
- receita
- conversão

por responsável.

---

# 12. Lead time

Lead time deve ser calculado utilizando eventos históricos.

Métricas desejadas:

- criação → primeiro contato
- criação → qualificação
- qualificação → reunião
- reunião → proposta
- proposta → fechamento
- criação → fechamento
- tempo médio em cada estágio

Não calcular utilizando apenas updated_at.

---

# 13. Financeiro

O módulo financeiro será desenvolvido após estabilização do CRM.

Áreas:

- contratos
- contas a receber
- contas a pagar
- contas financeiras
- categorias
- centros de custo
- fluxo de caixa
- DRE

---

# 14. Contas financeiras

Exemplos:

Banco
Caixa
Conta digital

Campos:

- nome
- tipo
- saldo inicial
- ativo

---

# 15. Contas a receber

Campos:

- cliente/contrato
- descrição
- competência
- vencimento
- valor
- status
- conta financeira
- data do recebimento
- valor recebido

Status:

PENDING
PAID
OVERDUE
CANCELLED

---

# 16. Contas a pagar

Campos:

- fornecedor
- descrição
- categoria
- centro de custo
- competência
- vencimento
- valor
- status
- conta financeira
- data do pagamento
- valor pago

---

# 17. Fluxo de caixa

Separar:

REALIZADO
PREVISTO

Visões:

- hoje
- 7 dias
- 30 dias
- 60 dias
- 90 dias
- personalizado

Nunca misturar automaticamente regime de caixa com regime de competência.

---

# 18. DRE

A DRE será gerencial e baseada em competência.

Estrutura inicial:

Receita Bruta

(-) Deduções

= Receita Líquida

(-) Custos Diretos

= Margem Bruta

(-) Despesas Operacionais

= Resultado Operacional

A estrutura deverá ser configurável por categorias financeiras.

---

# 19. Fora do escopo atual

Não implementar:

- gestão de conteúdo
- social media
- tarefas de clientes
- aprovação de posts
- chat
- RH
- folha
- fiscal
- emissão de nota
- gestão de estoque
- compras
- atendimento omnichannel
- portal do cliente

até aprovação explícita.