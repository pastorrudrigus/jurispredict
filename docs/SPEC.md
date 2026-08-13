# CRIVO — Motor de Crédito JC Distribuidora
## Especificação Técnica v1.0

> **Nome de trabalho:** "Crivo" (motor de decisão de crédito). Distinto do **Ábaco**, que é o bureau de dados já construído. O Crivo *consome* o Ábaco como uma de suas fontes.

---

## 1. Contexto e objetivo

A JC Distribuidora (atacado farmacêutico) já concede crédito informal via boleto a prazo (28/35/45 dias), fundeado no próprio capital de giro, sem precificação de risco. O objetivo é formalizar essa operação como produto de crédito:

- **Fase 1 (MVP):** motor de score e limite para prazo estendido nas compras, decidido internamente, formalizado via parceria BaaS/SCD (QI Tech, Celcoin ou similar).
- **Fase 2:** capital de giro com garantia de recebíveis de cartão (trava via registradora) + limite casado com volume de compra na JC.
- **Fase 3:** FIDC próprio quando a carteira justificar (~R$10-20M), com o Crivo como motor de elegibilidade das cessões.

**Princípio de governança:** decisão de crédito separada do comercial. O vendedor indica; o Crivo decide. Overrides só por alçada definida (Seção 8).

---

## 2. Arquitetura

```
ERP / Faturamento ──┐
Financeiro (CR)  ───┼──► Supabase (camada raw)
Ábaco (bureau)   ───┘         │
                              ▼
                    Views de features (camada analytics)
                              │
                              ▼
                    CRIVO (motor de decisão)
                    ├─ Política (knockouts)
                    ├─ Score comportamental
                    └─ Motor de limite
                              │
                              ▼
                    n8n (esteira de originação)
                    ├─ Webhook de solicitação
                    ├─ Chamada BaaS (CCB, assinatura)
                    ├─ Notificações (WhatsApp/Evolution API)
                    └─ Monitoramento diário (gatilhos)
```

**Stack:** Supabase (Postgres) para dados e decisões auditáveis; n8n para orquestração; Node.js/TypeScript para o serviço do motor (pode rodar como Edge Function do Supabase no MVP); integração REST com a SCD parceira.

---

## 3. Modelo de dados (Supabase)

### 3.1 Schema `credito`

```sql
create schema if not exists credito;

-- Cliente sob análise (espelho enriquecido do cadastro do ERP)
create table credito.clientes (
  id uuid primary key default gen_random_uuid(),
  erp_cliente_id text unique not null,
  cnpj text not null,
  razao_social text not null,
  data_primeiro_pedido date,
  segmento text,               -- farmácia independente, rede pequena, etc.
  uf text,
  municipio text,
  status_credito text default 'nao_avaliado'
    check (status_credito in ('nao_avaliado','ativo','suspenso','bloqueado','cobranca')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Snapshot mensal de features por cliente (materializado pelo job)
create table credito.features_mensais (
  cliente_id uuid references credito.clientes(id),
  competencia date not null,          -- primeiro dia do mês
  meses_relacionamento int,
  qtd_pedidos_12m int,
  faturamento_12m numeric,
  faturamento_medio_3m numeric,
  faturamento_medio_12m numeric,
  tendencia_volume numeric,           -- fat_3m / fat_12m (proxy de crescimento)
  ticket_medio numeric,
  recencia_dias int,                  -- dias desde o último pedido
  regularidade numeric,               -- % de meses com compra nos últimos 12
  pct_pago_em_dia numeric,            -- títulos liquidados sem atraso / total
  atraso_medio_dias numeric,
  pior_atraso_12m int,
  qtd_renegociacoes_12m int,
  valor_em_aberto numeric,
  valor_vencido numeric,
  dpd_atual int,                      -- days past due do pior título aberto
  score_abaco numeric,                -- score vindo do bureau Ábaco
  primary key (cliente_id, competencia)
);

-- Toda decisão é registrada — trilha de auditoria obrigatória
create table credito.decisoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references credito.clientes(id),
  solicitado_em timestamptz default now(),
  origem text check (origem in ('automatica','solicitacao_comercial','revisao_periodica')),
  score int,
  rating text check (rating in ('A','B','C','D','E')),
  knockouts jsonb,                    -- lista de regras de bloqueio acionadas
  limite_calculado numeric,
  limite_aprovado numeric,
  prazo_maximo_dias int,
  taxa_am numeric,                    -- taxa ao mês aplicada
  decisao text check (decisao in ('aprovado','negado','manual','suspenso')),
  decidido_por text default 'crivo',  -- 'crivo' ou usuário do override
  justificativa_override text,
  versao_politica text not null,      -- ex.: 'v1.0' — rastreabilidade da regra
  payload_features jsonb              -- snapshot das features usadas na decisão
);

-- Limites vigentes (estado atual, derivado da última decisão válida)
create table credito.limites (
  cliente_id uuid primary key references credito.clientes(id),
  limite numeric not null,
  utilizado numeric default 0,
  prazo_maximo_dias int,
  rating text,
  valido_ate date,                    -- força revisão periódica
  atualizado_em timestamptz default now()
);

-- Contratos formalizados via BaaS
create table credito.operacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references credito.clientes(id),
  decisao_id uuid references credito.decisoes(id),
  baas_contrato_id text,              -- id da CCB na SCD parceira
  tipo text check (tipo in ('prazo_estendido','capital_giro')),
  valor_principal numeric,
  taxa_am numeric,
  parcelas int,
  status text check (status in ('pendente_assinatura','ativo','liquidado','inadimplente','renegociado')),
  criado_em timestamptz default now()
);

-- Eventos de monitoramento (gatilhos disparados pelo job diário)
create table credito.eventos (
  id bigint generated always as identity primary key,
  cliente_id uuid references credito.clientes(id),
  tipo text,                          -- 'atraso_15d', 'queda_volume', 'limite_90pct', etc.
  detalhe jsonb,
  criado_em timestamptz default now(),
  tratado boolean default false
);
```

### 3.2 Fontes de extração (adaptar aos nomes reais do ERP)

O job de features precisa de, no mínimo:

| Fonte | Dados | Granularidade |
|---|---|---|
| Pedidos/faturamento | data, cliente, valor, itens | por NF |
| Contas a receber | título, vencimento, data de liquidação, valor, status | por título |
| Ábaco (bureau) | score externo, restritivos, consultas | por CNPJ |

**Regra de ouro:** rodar primeiro um script de auditoria contra o banco real para mapear nomes de tabelas/colunas — **não inventar convenções de nomenclatura**.

---

## 4. Motor de decisão — três camadas

### Camada 1 — Política (knockouts, binário)

Qualquer regra acionada → negado ou mesa manual, independente do score:

| Regra | Ação |
|---|---|
| CNPJ inapto/baixado na Receita | negar |
| Restritivo grave no Ábaco (protesto, execução fiscal relevante) | negar |
| `dpd_atual` > 30 dias na própria JC | negar |
| Renegociação nos últimos 6 meses | mesa manual |
| Relacionamento < 6 meses OU < 4 pedidos | mesa manual (sem histórico ⇒ limite conservador de entrada) |
| Valor vencido > 0 (qualquer) | suspender novas operações até regularizar |

### Camada 2 — Score comportamental (0–1000)

MVP: **scorecard de pontos por regra de negócio** (não modelo estatístico). Pesos iniciais:

| Bloco | Peso | Variáveis |
|---|---|---|
| Pontualidade | 35% | `pct_pago_em_dia`, `atraso_medio_dias`, `pior_atraso_12m` |
| Relacionamento | 20% | `meses_relacionamento`, `regularidade`, `recencia_dias` |
| Volume e tendência | 20% | `faturamento_12m`, `tendencia_volume` |
| Bureau (Ábaco) | 20% | `score_abaco` normalizado, restritivos leves |
| Concentração/perfil | 5% | segmento, ticket médio vs. mediana do segmento |

Cada variável é convertida em pontos por faixas (ex.: `pct_pago_em_dia` ≥ 98% → 100 pts; 90–98% → 70; 80–90% → 40; < 80% → 0). As faixas exatas devem ser calibradas na análise exploratória da base.

**Ratings:**

| Rating | Score | Perfil |
|---|---|---|
| A | 800–1000 | paga em dia, volume crescente |
| B | 650–799 | bom, atrasos eventuais curtos |
| C | 500–649 | irregular, monitorar |
| D | 350–499 | só com garantia/trava |
| E | < 350 | negar |

### Camada 3 — Motor de limite

Limite ancorado no que o cliente **já compra** — crédito a serviço do share of wallet:

```
limite_base = faturamento_medio_3m × multiplicador(rating)

multiplicador: A = 1.5 | B = 1.0 | C = 0.6 | D = 0.3 (com trava) | E = 0
```

Ajustes:
- **Teto absoluto** por cliente no MVP (ex.: R$ 100k) e **teto de carteira** (exposição total ≤ X% do faturamento mensal da JC — definir com o dono).
- **Cap de concentração:** nenhum cliente > 5% da carteira total.
- Prazo máximo por rating: A = 60d, B = 45d, C = 35d, D = 28d.
- Taxa por rating: definir com a SCD parceira (spread sobre o custo de funding + prêmio de risco por rating).
- `valido_ate` = 90 dias ⇒ revisão automática trimestral obrigatória.

---

## 5. Esteira de originação (n8n)

**Fluxo `crivo-originacao`:**

1. **Trigger:** webhook (solicitação do comercial via form/Bitrix) ou evento automático (pedido acima do limite atual).
2. **Enriquecimento:** consulta features no Supabase + chamada ao Ábaco (score/restritivos atualizados) + consulta situação cadastral CNPJ.
3. **Decisão:** chamada ao serviço Crivo → grava em `credito.decisoes`.
4. **Roteamento:**
   - `aprovado` → chama API da SCD (criação de CCB / termo de prazo) → dispara link de assinatura via WhatsApp (Evolution API).
   - `manual` → cria card na mesa de crédito (Bitrix) com o payload da decisão.
   - `negado` → notifica comercial com motivo genérico (nunca expor a regra exata — evita engenharia reversa da política).
5. **Callback BaaS:** webhook de assinatura/liquidação atualiza `credito.operacoes`.

**Fluxo `crivo-monitor` (diário):**

- Recalcula `dpd_atual` e `valor_vencido` de todos os clientes ativos.
- Gatilhos → `credito.eventos` + notificações:
  - atraso ≥ 5d → cobrança amistosa automática (WhatsApp)
  - atraso ≥ 15d → suspende limite (`status_credito = 'suspenso'`), notifica mesa
  - atraso ≥ 30d → bloqueia, aciona régua de cobrança formal
  - utilização ≥ 90% do limite → alerta comercial (oportunidade de revisão ou sinal de estresse — mesa decide)
  - queda de volume ≥ 40% em 3m → revisão antecipada do limite (early warning)

---

## 6. Integração BaaS (SCD parceira)

Contrato de interface genérico (adaptar ao parceiro escolhido):

- `POST /ccb` — criar operação: CNPJ, valor, taxa, parcelas, fluxo de assinatura
- `GET /ccb/{id}` — status
- Webhooks: `assinada`, `liquidada`, `vencida`
- Guardar sempre o `baas_contrato_id` em `credito.operacoes`

**Critérios de escolha do parceiro:** custo por CCB emitida, API de trava de recebíveis de cartão (Fase 2), possibilidade de cessão da carteira para FIDC futuro sem retrabalho de formalização, SLA de onboarding de sacado.

---

## 7. Segurança e LGPD

- Role Postgres **read-only** para o job de features; role de escrita restrita ao schema `credito`. Nunca usar o usuário `postgres` master em automações.
- RLS habilitado nas tabelas do schema `credito`.
- Credenciais em variáveis de ambiente / vault do n8n — nunca em código.
- Base legal LGPD: legítimo interesse + execução de contrato; cláusula de tratamento de dados de crédito no cadastro do cliente. Decisões automatizadas exigem possibilidade de revisão humana (Art. 20) — a mesa manual cumpre esse papel; registrar isso na política.
- Retenção: `payload_features` congela o snapshot da decisão (auditoria), mas dados brutos seguem política de retenção do ERP.

---

## 8. Governança

- **Alçadas de override:** até R$ 20k → analista de crédito; acima → sócio/comitê. Override sempre com `justificativa_override` preenchida — sem justificativa, o sistema rejeita.
- **Comercial nunca aprova crédito.** Indica, acompanha, mas não decide.
- **Versionamento de política:** toda mudança de peso/faixa gera nova `versao_politica`. Decisões antigas permanecem auditáveis contra a regra vigente na época.
- **Comitê mensal:** inadimplência por safra (vintage), por rating, top exposições, overrides do mês.

---

## 9. Métricas (dashboard mínimo)

- Carteira total, utilização média, exposição por rating
- Inadimplência 15/30/60/90 por **safra de originação** (vintage analysis)
- Taxa de aprovação automática vs. mesa manual
- Concentração top-10 clientes
- Spread líquido: receita financeira − custo BaaS − perda esperada

---

## 10. Roadmap de implementação

**Sprint 0 — Auditoria de dados (fazer ANTES de tudo):**
Script Node.js read-only contra o Supabase real: listar tabelas, colunas, checar completude do histórico de liquidação de títulos (a variável mais preditiva). Se o ERP não tiver data de liquidação por título, resolver isso primeiro — sem ela o score nasce manco.

**Sprint 1 — Camada de dados:** schema `credito`, job de features mensais, backfill de 12-24 meses.

**Sprint 2 — Motor:** knockouts + scorecard + limites. Rodar em modo **shadow** por 30 dias: o Crivo decide, mas ninguém executa — compara-se a decisão do motor com a prática atual para calibrar faixas antes de valer de verdade.

**Sprint 3 — Esteira:** n8n de originação + integração BaaS em sandbox + monitor diário.

**Sprint 4 — Piloto:** 20-30 clientes rating A/B, limite reduzido (50% do calculado), 90 dias. Só depois abre a régua.

**Fase 2 (pós-piloto):** trava de recebíveis de cartão via registradora (CERC/TAG) para ratings C/D e capital de giro; substituição gradual do scorecard por modelo estatístico (regressão logística é suficiente — não usar caixa-preta em decisão de crédito) quando houver ≥ ~300 clientes com desfecho observado.

**Fase 3:** critérios de elegibilidade de cessão para FIDC embutidos no Crivo (só títulos de rating ≥ B, sem atraso, dentro de concentração — as travas típicas de regulamento de fundo).
