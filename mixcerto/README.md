# MixCerto — competição inteligente, tributação e transporte

Aplicativo de demonstração para compras de um **mix de produtos** com destino inicial **Brasília/DF**:

- **Central de negociação (arena)**: cinco fornecedores fictícios competem pela mesma cesta. Inclui gráficos de composição de custo (*Radar de propostas*) e de evolução (*Evolução das rodadas*), melhoria de proposta simulada ou manual, condições de transporte editáveis (*Ajustar frete*) e geração de **pedido interno** do menor custo apto.
- **Inteligência tributária**: compara cinco origens (MG, SP, GO, PR, BA) para um produto e uma quantidade idênticos, com parâmetros tributários editáveis e separação entre **desembolso**, **crédito condicionado** e **custo econômico**.
- **Entrega e transporte**: laboratório local de custo posto por produto e modal (rodoviário, ferroviário, aéreo e cabotagem). Não altera a arena.
- Também há **Cotações-base**, **Pedidos**, **Verbas** (teto de desembolso e prazo máximo), **Catálogo** (estoque, validade e vida mínima) e **Auditoria**.

- **Controle de acesso**: login com e-mail e senha, perfis (administrador, comprador, somente leitura), gestão de usuários, troca obrigatória de senha temporária e auditoria por usuário.
- **Visão inteligente**, **Fornecedores** (scorecard), **Nova cotação** e **Importar mix (CSV)**, **Matriz por item**, notificações, tema claro/escuro e layout responsivo.

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

### Primeiro acesso

Na primeira inicialização o servidor cria o administrador inicial:

- com `MIXCERTO_ADMIN_EMAIL` e `MIXCERTO_ADMIN_PASSWORD` definidos, usa esses valores;
- sem senha definida, gera uma senha temporária e a mostra **uma vez** no log do servidor (e-mail padrão `admin@mixcerto.local`); a troca é exigida no primeiro login.

Depois, em **Usuários e acessos**, o administrador convida compradores e leitores com senha temporária.

Os dados ficam no Postgres de `DATABASE_URL` (ex.: Supabase) ou, sem ela, em `data/db.json` (ou no arquivo apontado por `MIXCERTO_DB`). Use **Catálogo → Restaurar demonstração** ou `POST /api/demo/reset` para voltar ao estado inicial.

### Deploy na Vercel + Supabase (recomendado)

A interface é publicada como site estático e a API como uma função serverless (`api/index.ts`). O estado fica no Postgres do Supabase, numa tabela `mixcerto_state` criada automaticamente no primeiro acesso. As escritas usam `SELECT … FOR UPDATE`, então funções concorrentes não sobrescrevem umas às outras.

1. **Supabase** → seu projeto → *Connect* → copie a connection string do **Transaction pooler** (porta 6543).
2. **Vercel** → *Add New → Project* → importe `pastorrudrigus/jurispredict` → **Root Directory: `mixcerto`**. O `vercel.json` já define build, saída e rotas.
3. Em *Environment Variables*:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | connection string do Supabase (com a senha do banco) |
| `MIXCERTO_ADMIN_EMAIL` | e-mail do administrador inicial |
| `MIXCERTO_ADMIN_PASSWORD` | senha inicial (mín. 10 caracteres, letras e números) |

4. *Deploy*. Os próximos pushes publicam automaticamente.

Sem `DATABASE_URL`, a função usa memória efêmera (os dados se perdem) — serve só para teste. TLS com o Supabase é obrigatório; `MIXCERTO_DB_SSL=verify` ativa a verificação estrita do certificado quando a CA estiver disponível.

### Deploy no Render

O `render.yaml` na raiz do repositório declara o serviço `mixcerto` (Docker, `rootDir: mixcerto`, health check em `/api/health`).
No Render: **New + → Blueprint**, conecte o repositório e escolha a branch. O Render pede `MIXCERTO_ADMIN_EMAIL` e `MIXCERTO_ADMIN_PASSWORD` (mín. 10 caracteres, letras e números). O serviço sobe em `https://mixcerto-xxxx.onrender.com`.
No plano gratuito o disco é efêmero: os dados de demonstração voltam ao estado inicial a cada reinício ou novo deploy.

### Testes e verificação

```bash
pnpm test           # vitest: motor competitivo, fiscal, transporte, HTTP e autenticação
TEST_DATABASE_URL=postgresql://... pnpm test   # inclui os testes de persistência/concorrência em Postgres
pnpm typecheck
MIXCERTO_EMAIL=... MIXCERTO_PASSWORD=... python3 scripts/competition-http-smoke.py   # com `pnpm dev` saudável
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
| POST | `/api/arenas` com `{ mix: [{ productId, quantity }], title }` | Nova cotação / mix importado |
| POST | `/api/arenas/:id/rodadas` | Simula a próxima rodada (`expectedVersion`) |
| POST | `/api/arenas/:id/lances` | Redução acumulada manual (`supplierId`, `reductionPct`, `expectedVersion`) |
| PUT | `/api/arenas/:id/propostas/:supplierId/logistica` | Ajusta frete (`terms`, `expectedVersion`) |
| POST | `/api/arenas/:id/encerrar` | Revalida cesta e ofertas e seleciona o vencedor |
| POST | `/api/arenas/:id/pedido` | Gera pedido (`expectedVersion`, `acknowledgeShortage`) — idempotente |
| GET | `/api/cotacoes` · POST `/api/cotacoes/:arenaId/pedido` | Cotação-base; o pedido delega às mesmas regras |
| GET | `/api/pedidos`, `/api/auditoria`, `/api/catalogo`, `/api/verbas`, `/api/fornecedores` | Consultas |
| POST | `/api/auth/login`, `/api/auth/logout`, `/api/auth/password` · GET `/api/auth/me` | Sessão e senha |
| GET/POST/PATCH | `/api/usuarios` | Gestão de usuários (administrador) |
| PATCH | `/api/catalogo/ofertas/:s/:p`, `/api/catalogo/produtos/:p`, `/api/verbas/:id` | Edições de catálogo e verba |

## Segurança e controle de acesso

| Item | Implementação |
|---|---|
| Senhas | `scrypt` com sal aleatório por usuário; mínimo de 10 caracteres com letras e números |
| Sessão | token aleatório de 256 bits em cookie `HttpOnly`, `SameSite=Strict` e `Secure` sob HTTPS; servidor guarda só o SHA-256; expira em 8 h |
| Força bruta | bloqueio de 15 min após 5 falhas por conta; limite por IP; mensagem genérica e tempo constante para e-mail inexistente |
| CSRF | escritas exigem o cabeçalho `X-MixCerto: 1`, além do cookie SameSite=Strict |
| Perfis | **Administrador**: tudo, inclusive verbas, usuários e restauração · **Comprador**: cotações, arena, frete, catálogo e pedidos · **Somente leitura**: consulta |
| Ciclo de vida | troca obrigatória da senha temporária; redefinir senha ou desativar encerra sessões; o admin não remove o próprio acesso |
| Auditoria | logins, falhas, alterações de usuários e todas as ações de compra com o e-mail do responsável |
| Cabeçalhos | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin` |

## Próximos passos para operação real

Cadastro fiscal por produto, origem, destino, regime e vigência, com atos de benefício verificados, NF-e/CT-e, autorização do responsável fiscal e integração explícita do resultado validado ao ranking. Depois podem vir: competição por item ou lote, compartilhamento autorizado de posição anônima ao vendedor, alertas de oportunidade, consolidação de entregas, acompanhamento do crédito realizado e conciliação fiscal. Essas etapas são planejamento; nenhum serviço externo está conectado.
