# Qarvon OS — Metrics Dictionary

Este documento define a semântica oficial das métricas.

Nenhum dashboard deve inventar definições próprias.

---

# 1. Regra geral

Toda métrica deve possuir:

- definição
- período
- fonte
- filtros
- fórmula

Métricas iguais devem produzir o mesmo resultado em qualquer tela.

---

# 2. Leads recebidos

Quantidade de leads criados durante o período.

Fonte:

leads.created_at

---

# 3. Leads qualificados

Quantidade de leads que entraram no estágio considerado QUALIFIED durante o período.

Utilizar histórico de estágio.

Não utilizar apenas estágio atual.

---

# 4. Reuniões

Quantidade de atividades MEETING realizadas no período.

Fonte:

activities

type = MEETING

A definição poderá evoluir para separar:

agendada
realizada
cancelada
no-show

quando necessário.

---

# 5. Propostas

Quantidade de propostas comerciais registradas no período.

Na primeira versão poderá utilizar atividade:

PROPOSAL

Caso propostas ganhem entidade própria, migrar a fonte oficial.

---

# 6. Vendas

Quantidade de deals com won_at dentro do período.

---

# 7. Receita vendida

Soma de deals.amount fechados no período.

Não significa dinheiro recebido.

---

# 8. Novo MRR

Soma de recurring_amount de novos contratos/deals recorrentes fechados no período.

Não incluir receita one-time.

---

# 9. Ticket médio

Receita vendida / quantidade de vendas

Se vendas = 0:

retornar 0 ou null conforme padrão definido na implementação.

Nunca dividir por zero.

---

# 10. Conversão geral

Vendas originadas dos leads da coorte / leads da coorte.

IMPORTANTE:

Conversão por coorte e conversão por eventos no período são conceitos diferentes.

Dashboards devem identificar claramente qual metodologia está sendo utilizada.

Preferência para análises de eficiência comercial:

coorte por data de entrada do lead.

---

# 11. Conversão entre etapas

Número de leads que chegaram à etapa seguinte
/
número de leads que chegaram à etapa anterior

Utilizar histórico.

---

# 12. Pipeline aberto

Soma do estimated_value dos leads atualmente em estágios OPEN.

---

# 13. Pipeline ponderado

Para cada oportunidade aberta:

estimated_value × stage_probability

Somar resultados.

Exemplo:

R$ 10.000
probabilidade 30%

pipeline ponderado = R$ 3.000

---

# 14. Lead time total

Tempo entre:

lead.created_at

e

deal.won_at

Considerar apenas negócios ganhos.

Apresentar preferencialmente:

média
mediana

A mediana é importante para reduzir distorção por outliers.

---

# 15. Tempo até primeiro contato

Tempo entre:

lead.created_at

e

primeira atividade considerada contato.

Atividades elegíveis inicialmente:

CALL
WHATSAPP
EMAIL

---

# 16. Tempo por estágio

Tempo entre:

entrada no estágio

e

entrada no próximo estágio.

Fonte:

lead_stage_history.

Se lead ainda estiver no estágio:

tempo atual = now() - entered_at.

---

# 17. Win rate

Deals ganhos
/
oportunidades encerradas

Onde:

encerradas = WON + LOST

Não confundir com conversão lead → venda.

---

# 18. Loss rate

Deals/oportunidades perdidas
/
oportunidades encerradas

---

# 19. Meta atingida

realizado / meta × 100

---

# 20. Meta restante

max(meta - realizado, 0)

---

# 21. Cobertura de pipeline

pipeline aberto
/
meta restante

Exemplo:

Pipeline = R$ 30.000
Meta restante = R$ 10.000

Cobertura = 3x

Quando meta restante = 0, não realizar divisão normal.

Exibir meta atingida.

---

# 22. Origem

Performance por origem deve permitir:

leads
vendas
conversão
receita vendida
novo MRR
ticket médio

Não atribuir vendas por origem diferente daquela registrada no lead sem modelo formal de atribuição.

---

# 23. Performance por vendedor

Inicialmente utilizar owner/responsável da oportunidade no fechamento.

Métricas:

leads
reuniões
propostas
vendas
receita
novo MRR
conversão

Se futuramente houver múltiplos vendedores por deal, definir modelo de atribuição antes de alterar métricas.

---

# FINANCEIRO

---

# 24. Receita recebida

Soma dos recebimentos efetivamente realizados no período.

Regime:

caixa.

---

# 25. Receita por competência

Receita reconhecida na competência correspondente.

Regime:

competência.

Não confundir com recebimento.

---

# 26. Despesa paga

Soma de pagamentos efetivamente realizados.

Regime:

caixa.

---

# 27. Despesa por competência

Despesas atribuídas à competência.

Regime:

competência.

---

# 28. Saldo de caixa

Saldo inicial
+ recebimentos
- pagamentos

Considerando movimentações efetivamente realizadas.

---

# 29. Contas a receber

Soma das obrigações de clientes ainda não recebidas/canceladas.

---

# 30. Contas a pagar

Soma das obrigações ainda não pagas/canceladas.

---

# 31. DRE

Utiliza regime de competência.

Fluxo de caixa utiliza regime de caixa.

Esses conceitos nunca devem ser misturados.

---

# 32. MRR

Receita recorrente mensal ativa.

A metodologia exata será especificada antes da implementação de contratos complexos.

---

# 33. Churn MRR

MRR perdido através de cancelamentos/reduções no período.

Implementar somente quando existir histórico contratual suficiente.

---

# 34. Net New MRR

New MRR
+ Expansion MRR
- Contraction MRR
- Churn MRR

Não implementar versões simplificadas incorretas apenas para preencher dashboard.

---

# 35. CAC

Implementar somente quando os custos de aquisição estiverem corretamente registrados e atribuídos.

Não estimar CAC usando dados incompletos.

---

# 36. LTV

Não implementar até existir metodologia formal aprovada.

Evitar métricas de vaidade calculadas com histórico insuficiente.