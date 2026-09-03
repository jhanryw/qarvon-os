# Qarvon OS — Vision

## 1. O que é o Qarvon OS

Qarvon OS é o sistema interno de gestão da Qarvon.

O objetivo é centralizar informações comerciais e financeiras da empresa em uma interface simples, rápida e orientada à tomada de decisão.

O sistema não deve tentar substituir todas as ferramentas utilizadas pela empresa.

Neste primeiro ciclo, existem apenas dois domínios:

1. CRM Comercial
2. Financeiro

Gestão operacional de clientes, projetos, conteúdo, mídia, tarefas e demais áreas NÃO fazem parte do escopo atual.

---

# 2. Problema

A Qarvon precisa conseguir responder rapidamente perguntas como:

- Quantos leads entraram?
- De onde vieram?
- Quantos foram qualificados?
- Quantas reuniões foram realizadas?
- Quantas propostas foram enviadas?
- Quantos contratos foram fechados?
- Qual é nossa conversão?
- Onde os leads estão travando?
- Quanto tempo levamos para fechar uma venda?
- Qual vendedor está performando melhor?
- Estamos atingindo nossas metas?
- Quanto existe no pipeline?
- Quanto MRR foi vendido?
- Quanto dinheiro entrou?
- Quanto dinheiro saiu?
- Quanto temos a receber?
- Quanto temos a pagar?
- Qual será nosso caixa nos próximos meses?
- A empresa está dando lucro?
- Qual é nossa margem?

Hoje essas respostas podem depender de múltiplas ferramentas, planilhas, memória ou cálculos manuais.

O Qarvon OS deve transformar esses dados em informação operacional.

---

# 3. Princípio central

O sistema deve exigir pouco esforço para ser alimentado e entregar muita informação em troca.

REGRA:

> O usuário não deve precisar preencher 20 campos para cadastrar um lead.

Informações podem ser enriquecidas ao longo do relacionamento.

---

# 4. Filosofia de produto

O Qarvon OS deve ser:

- simples
- rápido
- visual
- confiável
- orientado a dados
- fácil de manter
- fácil de evoluir

O sistema NÃO deve ser:

- um clone do ClickUp
- um clone do HubSpot
- um clone do Pipedrive
- um sistema contábil
- um gerenciador completo de projetos
- um sistema de RH
- uma ferramenta de chat
- uma plataforma de social media

---

# 5. Experiência desejada

O sistema deve ser simples o suficiente para que alguém consiga utilizá-lo sem treinamento complexo.

Exemplo:

Novo lead
→ cadastro rápido
→ aparece no pipeline
→ vendedor trabalha o lead
→ atividades são registradas
→ estágio muda
→ métricas são atualizadas automaticamente
→ lead fecha
→ contrato é criado
→ receita prevista entra no financeiro

O sistema deve evitar duplicidade de entrada de dados.

---

# 6. CRM

O CRM deve permitir:

- cadastrar leads rapidamente
- visualizar pipeline
- alterar estágio
- atribuir responsável
- registrar atividades
- definir próxima ação
- registrar reuniões
- registrar propostas
- registrar perdas
- registrar motivo da perda
- fechar negócios
- acompanhar metas
- analisar conversões
- analisar lead time
- analisar origem dos leads
- analisar performance comercial

---

# 7. Financeiro

O financeiro deve permitir:

- registrar contratos
- registrar receitas recorrentes
- gerar contas a receber
- registrar contas a pagar
- registrar recebimentos
- registrar pagamentos
- categorizar movimentações
- utilizar centros de custo
- visualizar fluxo de caixa
- visualizar projeção de caixa
- visualizar DRE gerencial
- acompanhar MRR
- acompanhar receita nova
- acompanhar churn futuramente

O financeiro será gerencial.

Ele não substitui contabilidade fiscal.

---

# 8. Integração CRM → Financeiro

Uma venda não deve precisar ser cadastrada novamente no financeiro.

Fluxo esperado:

Lead
→ Oportunidade
→ Fechado
→ Contrato
→ Contas a receber
→ Recebimento
→ Fluxo de caixa / DRE

O dado deve nascer uma vez e ser reutilizado.

---

# 9. Dados históricos

O sistema deve preservar histórico.

Nunca depender apenas do estado atual.

Exemplo:

Não basta saber:

stage = "won"

É necessário saber:

Lead criado: 01/09
Qualificado: 02/09
Reunião: 04/09
Proposta: 05/09
Fechado: 09/09

Isso permite calcular lead time, conversão e eficiência comercial corretamente.

---

# 10. Dashboards

Dashboards devem responder perguntas.

Não devem existir apenas por estética.

Cada gráfico ou KPI deve apoiar alguma decisão.

Exemplo:

"Pipeline: R$ 30.000"

é menos útil que:

Pipeline: R$ 30.000
Pipeline ponderado: R$ 12.400
Meta restante: R$ 7.000
Cobertura da meta: 1,77x

---

# 11. Arquitetura futura

O sistema deve permitir evolução futura para:

- gestão de clientes
- projetos
- tarefas
- conteúdo
- mídia
- contratos
- cobrança automatizada
- WhatsApp
- Meta Ads
- Google Ads
- automações
- inteligência artificial
- relatórios automáticos

Nenhuma dessas funcionalidades deve ser construída agora se não fizer parte do roadmap aprovado.

---

# 12. Regra de escopo

Antes de desenvolver qualquer funcionalidade, perguntar:

1. Isso pertence ao CRM ou Financeiro?
2. É necessário agora?
3. Existe uma forma mais simples?
4. Estamos criando algo porque precisamos ou porque seria interessante?

Se não for necessário para o estágio atual, deve ficar fora do escopo.