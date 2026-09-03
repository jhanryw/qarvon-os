# Qarvon OS — Architecture

# 1. Princípios

A arquitetura deve priorizar:

1. simplicidade
2. segurança
3. previsibilidade
4. testabilidade
5. manutenção
6. performance suficiente
7. evolução incremental

Evitar abstrações sem necessidade real.

---

# 2. Stack

Stack preferencial:

Frontend / Application:
- Next.js
- TypeScript

Database:
- PostgreSQL

Backend services:
- Supabase self-hosted

Auth:
- Supabase Auth

Database access:
- Supabase

Styling:
- seguir padrão escolhido no início do projeto
- evitar múltiplos sistemas de UI concorrentes

---

# 3. Infraestrutura

Qarvon OS deve possuir Supabase independente.

Não utilizar banco da Santtorini.

Pode compartilhar infraestrutura física/VPS se tecnicamente adequado.

Não compartilhar:

- database
- migrations
- auth
- secrets
- storage
- policies

com Santtorini.

---

# 4. Multi-tenant

Mesmo inicialmente existindo apenas Qarvon, o sistema deve possuir conceito de organização.

Tabela raiz:

organizations

Tabelas de negócio devem possuir:

organization_id

quando aplicável.

Objetivo:

- isolamento
- segurança
- possibilidade futura de múltiplas organizações

Não construir funcionalidades SaaS agora.

---

# 5. Segurança

Utilizar Row Level Security quando aplicável.

Nenhum usuário deve acessar dados de outra organização.

Nunca confiar apenas em filtros frontend.

Exemplo incorreto:

SELECT * FROM leads
filtrado apenas no JavaScript.

A autorização deve existir também no banco/backend.

---

# 6. Migrations

Toda mudança de schema deve ocorrer através de migration versionada.

PROIBIDO:

- alterar produção manualmente sem migration
- editar migration já aplicada
- depender de mudança não registrada

Migrations devem ser pequenas e específicas.

---

# 7. TypeScript

Evitar uso de:

any

quando existir tipo conhecido.

Preferir tipos gerados a partir do banco quando possível.

Separar quando necessário:

Database types
Domain types
UI types

Não duplicar interfaces sem necessidade.

---

# 8. Camadas

Evitar acesso desorganizado ao banco espalhado por componentes.

Fluxo preferencial:

UI
→ Application/Service
→ Data Access
→ Supabase/PostgreSQL

A arquitetura exata pode ser simplificada quando necessário.

O objetivo é impedir lógica de negócio duplicada.

---

# 9. Regras de negócio

Regras importantes devem estar centralizadas.

Exemplo:

Mudança de estágio não deve ser implementada de maneira diferente em:

- Kanban
- página do lead
- tabela

Todas devem utilizar a mesma regra.

---

# 10. Histórico

Eventos relevantes devem ser persistidos.

Não depender de logs de aplicação para dados de negócio.

Exemplo:

Mudança de estágio:

lead_stage_history

deve registrar:

- lead
- estágio anterior
- novo estágio
- usuário
- timestamp

---

# 11. Datas

Utilizar timestamps consistentes.

Banco:

preferencialmente timestamptz.

Armazenar timestamps de forma consistente.

Apresentação deve respeitar timezone configurado da organização.

Nunca calcular métricas temporais utilizando strings formatadas.

---

# 12. Valores monetários

Nunca utilizar float para dinheiro.

Utilizar:

numeric/decimal

ou estratégia equivalente segura.

Definir padrão único para todo o projeto.

---

# 13. Exclusão

Preferir preservação de histórico.

Dados comerciais e financeiros importantes não devem ser apagados fisicamente sem motivo forte.

Utilizar:

archived_at
deleted_at
active

quando adequado.

Não utilizar soft delete indiscriminadamente.

---

# 14. Dashboards

Dashboards não devem executar dezenas de consultas independentes sem necessidade.

Conforme volume crescer, considerar:

- SQL agregada
- views
- materialized views
- RPCs
- caching

Não otimizar prematuramente.

Primeiro garantir correção das métricas.

---

# 15. Métricas

Toda métrica importante deve possuir:

- definição formal
- fonte dos dados
- período
- filtros
- teste

METRICS.md é a fonte de verdade semântica.

---

# 16. Auditoria

Ações importantes devem permitir rastreabilidade.

Inicialmente:

- criação de lead
- mudança de estágio
- alteração de responsável
- fechamento
- perda
- criação/alteração de contrato
- recebimento
- pagamento

---

# 17. Testes

Priorizar testes para:

- regras de negócio
- permissões
- cálculos financeiros
- métricas
- mudanças de estágio
- geração de histórico

Não perseguir cobertura percentual artificial.

Testar aquilo cuja quebra geraria decisão errada ou perda de dados.

---

# 18. Integrações

Integrações futuras devem ser isoladas do domínio principal.

Exemplos:

Meta
WhatsApp
Google
n8n
AbacatePay
Stripe

Falha de uma integração não deve corromper o CRM ou financeiro.

---

# 19. Observabilidade

Erros relevantes devem possuir contexto suficiente para diagnóstico.

Não registrar:

- tokens
- passwords
- secrets
- dados sensíveis desnecessários

---

# 20. Performance

Primeiro:

correto

Depois:

rápido.

Não sacrificar consistência de métricas por otimizações prematuras.

---

# 21. Regra de alteração

Antes de alterar arquitetura existente:

1. entender implementação atual
2. identificar dependências
3. propor mudança
4. avaliar impacto
5. implementar somente após definição clara

Não realizar grandes refatorações junto com features pequenas.