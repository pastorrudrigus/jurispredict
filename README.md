# Crivo — Motor de Crédito JC Distribuidora

Motor de decisão de crédito conforme a spec v1.0: política (knockouts) → score
comportamental (0–1000) → motor de limite. Distinto do **Ábaco** (bureau de
dados), que o Crivo consome como fonte.

## Estado atual

| Sprint | Status |
|---|---|
| **Sprint 0 — auditoria de dados** | ✅ script pronto (`scripts/audit-db.ts`) — **pendente de execução contra o banco real** |
| Sprint 1 — schema `credito` + job de features | ⛔ bloqueado até a auditoria rodar (regra de ouro: não inventar nomes) |
| Motor de decisão (lógica pura) | ✅ implementado em `src/engine/` com testes — faixas do scorecard são valores de partida, a calibrar no modo shadow |
| Sprint 3 — esteira n8n + BaaS | ⛔ aguarda Sprint 1 |

Nenhuma tabela, migration ou workflow foi criado — por instrução explícita da
spec, isso só acontece depois que a auditoria rodar e o resultado for revisado.

## Sprint 0 — rodar a auditoria

```bash
npm install
cp .env.example .env   # preencher SUPABASE_DB_URL com role READ-ONLY
SUPABASE_DB_URL=postgresql://... npm run audit
```

O script:
- força a sessão em `default_transaction_read_only = on` (só SELECTs);
- inventaria schemas/tabelas/colunas com estimativa de linhas;
- identifica por heurística as candidatas a fonte de pedidos/faturamento,
  contas a receber e cadastro de clientes;
- mede a **completude da data de liquidação por título** (a variável mais
  preditiva do score), inclusive o recorte crítico: % preenchida entre títulos
  já vencidos;
- mede a cobertura de histórico (meses) para dimensionar o backfill de 12–24m;
- gera `reports/audit-<data>.md` + `.json`.

Se o relatório mostrar completude de liquidação < 90% entre títulos vencidos,
resolver a origem da baixa **antes** do Sprint 1 — sem ela o score nasce manco.

Se a heurística não encontrar as tabelas, ajustar os regexes em `RX` no topo de
`scripts/audit-db.ts` usando os nomes reais listados no inventário.

## Motor de decisão

Lógica pura em `src/engine/` (sem dependência de banco — vira Edge Function
`crivo-decide` no Sprint 2, quando o schema `credito` existir):

- `knockouts.ts` — Camada 1: política binária (CNPJ inapto, restritivo grave,
  dpd > 30, renegociação 6m, sem histórico, valor vencido). Precedência:
  negar > suspender > manual.
- `scorecard.ts` — Camada 2: 5 blocos ponderados (pontualidade 35%,
  relacionamento 20%, volume 20%, Ábaco 20%, perfil 5%) → score 0–1000 →
  rating A–E. **Faixas são default de partida — calibrar na análise
  exploratória (Sprint 2, modo shadow) antes de produção.**
- `limites.ts` — Camada 3: `faturamento_medio_3m × multiplicador(rating)`,
  teto absoluto R$ 100k, cap de concentração 5% da carteira, prazo e validade
  (90 dias) por rating.
- `crivo.ts` — orquestra as três camadas; toda decisão sai com
  `versao_politica` e snapshot das features (trilha de auditoria).

```bash
npm test        # casos: knockouts, cliente novo, cliente A, atraso ativo
npm run typecheck
```

## Governança (lembretes da spec)

- Comercial nunca aprova crédito — indica, acompanha, não decide.
- Override só por alçada (≤ R$ 20k analista; acima, sócio/comitê) e sempre com
  justificativa registrada.
- Mudou peso ou faixa ⇒ nova `versao_politica`; decisões antigas permanecem
  auditáveis contra a regra da época.
