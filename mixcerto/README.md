# MixCerto — competição inteligente, tributação e transporte

Aplicativo de demonstração para compras de um **mix de produtos** com destino inicial **Brasília/DF**:

- **Central de negociação (arena)**: cinco fornecedores fictícios competem pela mesma cesta. Inclui gráficos de composição de custo (*Radar de propostas*) e de evolução (*Evolução das rodadas*), melhoria de proposta simulada ou manual, condições de transporte editáveis (*Ajustar frete*) e geração de **pedido interno** do menor custo apto.
- **Inteligência tributária**: compara cinco origens (MG, SP, GO, PR, BA) para um produto e uma quantidade idênticos, com parâmetros tributários editáveis e separação entre **desembolso**, **crédito condicionado** e **custo econômico**.
- **Entrega e transporte**: laboratório local de custo posto por produto e modal (rodoviário, ferroviário, aéreo e cabotagem). Não altera a arena.
- Também há **Cotações-base**, **Pedidos**, **Verbas** (teto de desembolso e prazo máximo), **Catálogo** (estoque, validade e vida mínima) e **Auditoria**.

> Todos os fornecedores, preços, estoques, origens e perfis fiscais são **sintéticos e hipotéticos**. Nenhuma compra externa é transmitida e nenhum resultado substitui validação documental ou profissional.

## Como executar

Requisitos: Node 20+ e npm ou pnpm.

```bash
pnpm install        # ou: npm install
pnpm dev            # API em :3001 + interface em http://localhost:5173
```

Produção (API e interface no mesmo processo, porta 3001):

```bash
pnpm build && pnpm start
```

Os dados ficam em `data/db.json` (ou no arquivo apontado por `MIXCERTO_DB`). Use **Catálogo → Restaurar demonstração** ou `POST /api/demo/reset` para voltar ao estado inicial.

### Testes e verificação

```bash
pnpm test           # vitest: motor competitivo, fiscal, transporte e fluxo HTTP
pnpm typecheck
python3 scripts/competition-http-smoke.py   # com `pnpm dev` saudável
```

A demonstração HTTP cria somente uma arena e um pedido sintéticos e percorre: rodadas, limite de rodadas, conflito de versão, cotação-base sem atalho, encerramento, bloqueio pós-encerramento, falta não reconhecida, aceite parcial, pedido reconciliado e idempotência.

## Roteiro de demonstração

1. Abra a central e clique em **Ativar competição do mix**. O mix de 20 produtos é preservado: 19 podem ser atendidos e o *saco para lixo reforçado* fica explícito como indisponível.
2. Clique em **Simular próxima rodada** três vezes. Em cada rodada o desafiante apto mais próximo do líder melhora sua tabela em 0,5 p.p. A liderança alterna (Paulista → Abastece Minas → Paulista → Abastece Minas) e a melhor compra cai.
3. Veja que **Sul Suprimentos** tem a menor mercadoria, mas perde por frete e despesas, e que **Baía Comercial** fica inapta (estoque de café e prazo).
4. **Encerrar e selecionar** → marque o reconhecimento da falta → **Gerar pedido do vencedor**. Repetir a confirmação não duplica o pedido.

Na execução de referência (`scripts/competition-http-smoke.py`), Abastece Minas vence com desembolso de **R$ 7.800,20** e custo econômico de **R$ 7.732,68**. A melhoria nominal contra a melhor proposta inicial é de **R$ 40,06**, sobre a mesma cesta de 19 itens. São valores sintéticos.

## Arquitetura

| Caminho | Conteúdo |
|---|---|
| `shared/contracts.ts` | Tipos de produto, fornecedor, oferta, logística, verba e auditoria |
| `shared/competition.ts` | Cesta atendível, avaliação, ranking, explicação e tipos de arena/pedido |
| `shared/tax-simulator.ts` | Cálculo fiscal didático (ICMS próprio, ST, crédito, VP, débito de saída) |
| `shared/transport.ts` | Validação logística e regra do frete incremental |
| `server/domain/competition.ts` | Motor competitivo: rodadas, lances, frete, encerramento e pedido |
| `server/demo/competition-routes.ts` | Rotas HTTP (`/api/...`) |
| `client/src/pages/ArenaDashboard.tsx` | Central de negociação e gráficos |
| `client/src/pages/TaxLab.tsx` | Inteligência tributária |
| `client/src/pages/TransportLab.tsx` | Entrega e transporte |
| `docs/` | Metodologia, simulador fiscal/logístico, fontes e limites |

### API

| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/api/arenas` | Lista / cria nova arena (não exclui as anteriores) |
| GET | `/api/arenas/:id` | Arena com ranking, explicação e alerta de divergência de cesta |
| POST | `/api/arenas/:id/rodadas` | Simula a próxima rodada (`expectedVersion`) |
| POST | `/api/arenas/:id/lances` | Redução acumulada manual (`supplierId`, `reductionPct`, `expectedVersion`) |
| PUT | `/api/arenas/:id/propostas/:supplierId/logistica` | Ajusta frete (`terms`, `expectedVersion`) |
| POST | `/api/arenas/:id/encerrar` | Revalida cesta e ofertas e seleciona o vencedor |
| POST | `/api/arenas/:id/pedido` | Gera pedido (`expectedVersion`, `acknowledgeShortage`) — idempotente |
| GET | `/api/cotacoes` · POST `/api/cotacoes/:arenaId/pedido` | Cotação-base; o pedido delega às mesmas regras |
| GET | `/api/pedidos`, `/api/auditoria`, `/api/catalogo`, `/api/verbas` | Consultas |
| PATCH | `/api/catalogo/ofertas/:s/:p`, `/api/catalogo/produtos/:p`, `/api/verbas/:id` | Edições de catálogo e verba |

## Próximos passos para operação real

Cadastro fiscal por produto, origem, destino, regime e vigência, com atos de benefício verificados, NF-e/CT-e, autorização do responsável fiscal e integração explícita do resultado validado ao ranking. Depois podem vir: competição por item ou lote, compartilhamento autorizado de posição anônima ao vendedor, alertas de oportunidade, consolidação de entregas, acompanhamento do crédito realizado e conciliação fiscal. Essas etapas são planejamento; nenhum serviço externo está conectado.
