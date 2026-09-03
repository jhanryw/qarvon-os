# Qarvon OS — Claude Development Instructions

Você está trabalhando no Qarvon OS.

Antes de implementar mudanças relevantes, leia este arquivo.

Para decisões de produto consulte:

docs/VISION.md
docs/PRODUCT.md

Para arquitetura:

docs/ARCHITECTURE.md

Para banco:

docs/DATABASE.md

Para métricas:

docs/METRICS.md

Para ordem de desenvolvimento:

docs/ROADMAP.md

Esses documentos são a fonte de verdade do projeto.

---

# 1. REGRA PRINCIPAL

Não invente requisitos.

Não amplie escopo.

Não implemente funcionalidades futuras sem solicitação.

Se uma decisão não estiver definida e afetar significativamente arquitetura, banco ou regra de negócio, apresente a decisão antes de implementar.

---

# 2. ANTES DE IMPLEMENTAR

Para mudanças não triviais:

1. entenda a solicitação
2. leia documentação relevante
3. localize arquivos relevantes
4. entenda implementação atual
5. identifique impacto
6. implemente somente o necessário

Não faça exploração indiscriminada do repositório.

---

# 3. ECONOMIA DE CONTEXTO

Leia somente arquivos necessários para a tarefa.

Não leia todo o repositório sem necessidade.

Prefira:

documentação relevante
+
arquivos diretamente relacionados
+
testes relacionados

Evite repetir análises já documentadas.

---

# 4. ESCOPO

Não realizar:

- refatorações estéticas não solicitadas
- renomeações em massa
- reorganização de diretórios sem necessidade
- troca de bibliotecas sem justificativa
- criação de abstrações especulativas
- features adicionais "aproveitando a oportunidade"

Uma feature por vez.

---

# 5. BANCO

Toda alteração de schema deve possuir migration.

Nunca alterar banco de produção manualmente.

Nunca editar migration já aplicada.

Utilizar foreign keys.

Preservar integridade.

Toda tabela multi-tenant relevante deve respeitar organization_id.

Nunca confiar em organization_id vindo do frontend sem autorização adequada.

---

# 6. SEGURANÇA

RLS deve ser utilizada conforme arquitetura.

Nunca depender somente de filtros frontend para isolamento.

Nunca expor:

- service role key
- secrets
- passwords
- tokens

ao frontend.

Não registrar secrets em logs.

---

# 7. HISTÓRICO

Não destruir histórico comercial ou financeiro para simplificar implementação.

Mudança de estágio deve gerar histórico.

WON e LOST devem permanecer auditáveis.

Pagamentos e recebimentos devem ser auditáveis.

---

# 8. MÉTRICAS

Nunca implementar métrica sem consultar:

docs/METRICS.md

Não criar definição alternativa porque é mais fácil consultar.

Correção é mais importante que simplicidade da query.

Quando uma métrica não puder ser calculada corretamente com os dados existentes:

informe.

Não invente aproximação silenciosamente.

---

# 9. DINHEIRO

Nunca utilizar float para valores monetários.

Não misturar:

regime de caixa

com

regime de competência.

Fluxo de caixa e DRE possuem semânticas diferentes.

---

# 10. DATAS

Utilizar timestamps de maneira consistente.

Respeitar timezone da organização.

Evitar cálculos temporais no frontend quando deveriam ser realizados de forma consistente no domínio/backend.

---

# 11. LÓGICA DE NEGÓCIO

Evitar duplicação.

Exemplo:

Se Kanban e página do lead alteram estágio, ambos devem utilizar a mesma regra de negócio.

Não implementar regras divergentes por tela.

---

# 12. TYPESCRIPT

Evitar any.

Utilizar tipos do banco quando apropriado.

Não duplicar tipos sem necessidade.

Typecheck deve permanecer limpo.

---

# 13. TESTES

Após implementação:

1. executar testes relacionados
2. executar typecheck
3. executar lint quando aplicável

Para mudanças críticas, adicionar testes.

Prioridades:

- isolamento entre organizações
- mudança de estágio
- histórico
- métricas
- fechamento
- cálculos financeiros
- pagamentos
- recebimentos

---

# 14. REGRESSÃO

Antes de corrigir bug:

identificar causa raiz.

Não mascarar sintomas.

Quando possível:

1. reproduzir
2. criar teste
3. corrigir
4. confirmar teste

---

# 15. REFATORAÇÃO

Não misturar grandes refatorações com feature.

Se uma refatoração for realmente necessária:

explique antes:

- problema
- impacto
- arquivos
- risco
- benefício

---

# 16. DEPENDÊNCIAS

Não instalar biblioteca apenas para resolver problema trivial.

Antes de adicionar dependência:

verificar se projeto já possui solução.

Evitar bibliotecas redundantes.

---

# 17. UI

Priorizar:

clareza
velocidade
consistência

Não criar interfaces excessivamente complexas.

CRM deve ser rápido para operar.

Cadastro de lead deve exigir poucos campos inicialmente.

---

# 18. DASHBOARDS

Não criar gráfico sem finalidade.

KPIs devem seguir METRICS.md.

Filtros devem produzir resultados semanticamente consistentes.

Não sacrificar precisão para criar dashboard visualmente interessante.

---

# 19. PERFORMANCE

Não otimizar prematuramente.

Primeiro:

correção.

Depois:

medição.

Depois:

otimização.

---

# 20. ENTREGA DE TAREFA

Ao finalizar uma implementação, responder de forma objetiva:

## Implementado
- ...

## Arquivos principais alterados
- ...

## Banco
- migration criada / nenhuma alteração

## Validação
- typecheck
- testes
- lint

## Pendências
- somente pendências reais

Não produzir explicações longas quando não necessárias.

---

# 21. QUANDO A SOLICITAÇÃO FOR DE AUDITORIA

Não altere código imediatamente.

Primeiro:

1. investigue
2. identifique causa
3. identifique arquivos
4. avalie impacto
5. proponha plano

Só implemente quando solicitado ou quando a solicitação explicitamente pedir auditoria + correção.

---

# 22. ROADMAP

Respeitar docs/ROADMAP.md.

Não antecipar módulos futuros.

Especialmente:

NÃO implementar gestão operacional de clientes durante as fases iniciais.

O escopo inicial é:

CRM

seguido por:

Financeiro.

---

# 23. PRINCÍPIO FINAL

O Qarvon OS deve permanecer simples.

Quando existirem duas soluções corretas, preferir aquela que:

- possui menos complexidade
- possui menos código
- possui menos dependências
- é mais fácil de testar
- é mais fácil de entender
- preserva capacidade de evolução

Não construir hoje a complexidade que talvez seja necessária amanhã.