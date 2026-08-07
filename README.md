# Radar Imob Goiânia

SaaS self-service de **deal flow de repasses / cessão de direitos de imóveis na
planta em Goiânia**. O corretor se cadastra sozinho, é aprovado e passa a ver um
pool de oportunidades que ninguém indexa — anúncios pulverizados em grupos de
WhatsApp, Facebook e OLX, capturados e estruturados por IA.

O corretor é o cliente; a dor dele é **captação**, não lead de comprador.

## Modelo: pool compartilhado

```
operador (admin)                    corretor (self-service)
  cola anúncios em /ingerir           cadastra-se em /cadastrar
  IA estrutura + dedup                  ↓ nasce `pendente`
  vira lead no pool  ───────────────► admin aprova em /admin/corretores
                                        ↓ vira `ativo`
                                      vê o MESMO pool em /
                                      abre o card, copia o pitch, chama no zap
```

O pool é **único**: não há dono por lead, não há exclusividade territorial. Quem
trabalha primeiro leva. Quem ingere é sempre o admin.

**Cobrança ainda não existe** — a aprovação manual em `/admin/corretores` é o
portão. É de propósito: dá para validar se corretor paga antes de escrever
integração de pagamento.

---

## Stack

| Camada    | Escolha |
|-----------|---------|
| App       | Next.js 14 (App Router, TypeScript), deploy na Vercel |
| Dados     | Supabase Postgres com **RLS ligado** |
| Auth      | Supabase Auth (e-mail + senha) via `@supabase/ssr` |
| IA        | API da Anthropic, modelo `claude-sonnet-4-6` |
| UI        | Tailwind CSS |

---

## Setup

### 1. Banco

No SQL Editor do Supabase, **em ordem**:

1. `supabase/migrations/0001_init.sql` — tabelas, índices, `unaccent_safe`,
   `match_empreendimento`, `sinais_judiciais`.
2. `supabase/migrations/0002_auth_saas.sql` — `perfis`, trigger de cadastro,
   helpers de política e **RLS em todas as tabelas**.
3. `scripts/seed.sql` (opcional) — 20 empreendimentos **placeholder fictícios**,
   marcados como tal. Substitua pelos reais dos sites das construtoras; é essa
   base que faz o fuzzy match e a data de entrega no pitch funcionarem.

### 2. Virar admin

O primeiro cadastro é seu. Depois de se cadastrar pela tela, rode no SQL Editor:

```sql
update perfis
   set papel = 'admin', status_acesso = 'ativo'
 where email = 'seu-email@exemplo.com';
```

**Sem isso ninguém é admin** e `/ingerir` fica inacessível para todo mundo.

### 3. Variáveis de ambiente

Copie `.env.example` para `.env.local` e replique na Vercel:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
ANTHROPIC_API_KEY=
```

A `anon key` é pública **de propósito** — quem protege os dados é o RLS, não o
segredo da chave. A `service_role` ignora RLS e só aparece em caminhos que já
chamaram `exigirAdmin()`.

Opcionais (P1 — DataJud): `DATAJUD_API_KEY`, `CRON_SECRET`, `DATAJUD_MUNICIPIO_IBGE`.

### 4. Rodar

```bash
npm install
npm run dev
npm run build
./scripts/testar-rls.sh   # exercita o RLS num Postgres local
```

---

## Telas

| Rota | Quem vê | O quê |
|------|---------|-------|
| `/cadastrar`, `/entrar` | qualquer um | cadastro self-service e login |
| `/aguardando` | conta pendente/suspensa | explica que o acesso está em análise |
| `/` | corretor ativo e admin | pool de oportunidades, filtros, drawer com o anúncio original e o telefone do vendedor |
| `/ingerir` | admin | caixa de ingestão |
| `/lista` | admin | gerador da mensagem para corretor |
| `/empreendimentos` | admin | CRUD da base de fuzzy match |
| `/admin/corretores` | admin | aprovar, suspender e promover contas |

### Ingestão (`/ingerir`)

Cole vários anúncios separados por uma linha contendo apenas `---`. Por anúncio:

1. **Dedup** — `md5(fonte + texto normalizado)`; duplicata é ⚠️ e não gasta token.
2. **Extração** — Anthropic (`claude-sonnet-4-6`, `max_tokens: 1024`), parse
   defensivo (tira cercas ```` ```json ````, recorta do primeiro `{` ao último `}`).
3. **`eh_repasse=false`** → grava `status='invalido'` para auditoria (❌). O RLS
   esconde esses do corretor.
4. **Fuzzy match** via `pg_trgm`, vincula se `similarity >= 0.35`.
5. **Insert**.

Roda em lotes de 20 com barra de progresso. **Erro em um item não derruba o
lote** — vira 💥 com a mensagem e o processamento segue.

---

## Segurança

O modelo mudou de "senha única no middleware" para **RLS de verdade**:

- Toda leitura do app usa a **anon key com a sessão do usuário**
  (`dbUsuario()`), então as políticas do Postgres decidem linha a linha.
- A `service_role` (`db()`) ignora RLS e só é usada na ingestão e no cron,
  ambos atrás de `exigirAdmin()`.
- Papel é checado no servidor (`exigirAdmin()` no topo de cada página e de cada
  server action de escrita). Esconder o botão na UI não é autorização.
- Sessão validada com `getUser()` (valida o JWT no servidor), nunca
  `getSession()` (que só lê o cookie e é falsificável).
- Login não distingue "e-mail não existe" de "senha errada" — isso viraria um
  oráculo para descobrir quem tem conta.
- `NEXT_PUBLIC_*` são deliberadamente públicas; `SUPABASE_SERVICE_KEY` e
  `ANTHROPIC_API_KEY` ficam isoladas por `server-only`, que quebra o build se
  algum componente client as importar.

### O que está testado

`./scripts/testar-rls.sh` sobe um Postgres local imitando o Supabase (roles
`anon`/`authenticated`, schema `auth`, `auth.uid()`), aplica as migrations reais
e verifica 18 asserções, entre elas:

- corretor ativo vê o pool, mas **não** vê `invalido` nem `expirado`
- corretor **pendente** e **suspenso** não veem absolutamente nada
- corretor não altera lead, não insere empreendimento
- corretor **não se auto-aprova** e **não se promove a admin**
- `anon` (sem login) não lê nada
- admin vê tudo e aprova contas

### Armadilhas que já custaram caro aqui

- **O middleware precisa ficar em `src/middleware.ts`.** Em projeto com
  diretório `src/`, um `middleware.ts` na raiz é silenciosamente ignorado — e o
  app inteiro fica aberto sem nenhum erro aparecer.
- **O layout raiz lê a sessão**, então tudo é `force-dynamic`. Sem isso o build
  falha ao tentar pré-renderizar `/entrar`, `/cadastrar` e `/_not-found`.

### Dívida técnica conhecida

- **Sem cobrança.** Aprovação é manual; não há assinatura, trial nem bloqueio
  por inadimplência.
- **Sem confirmação de e-mail obrigatória** no código — se você ligar a
  confirmação no Supabase, o fluxo já trata (avisa para confirmar antes de
  entrar), mas não há reenvio de e-mail nem recuperação de senha.
- **Sem rate limit** no cadastro: qualquer um cria conta. O portão é a aprovação.
- `npm audit` acusa 2 vulnerabilidades altas em `postcss` **transitivo do próprio
  Next 14** (build-time, não runtime). Só some migrando para Next 16, que é
  breaking change.

---

## Roadmap (fora de escopo agora)

- Cobrança (Stripe), trial e bloqueio por inadimplência
- Exclusividade territorial por bairro/região
- Crawler automatizado de OLX e Facebook (hoje a captação é copy-paste)
- Recuperação de senha e login social
- Matrículas / SAEC
- Score treinado por feedback real de conversão

---

## Estrutura

```
src/
  middleware.ts                 sessão Supabase + gate de rota (tem que ficar aqui)
  app/
    page.tsx                    pool de leads (visão muda por papel)
    entrar/ cadastrar/          auth self-service
    aguardando/                 conta pendente ou suspensa
    ingerir/ lista/             admin: ingestão e geração de lista
    empreendimentos/            admin: CRUD do fuzzy match
    admin/corretores/           admin: aprovar e promover contas
    api/cron/datajud/           coleta DataJud TJGO (P1)
    actions/                    server actions (todas com gate de papel)
  components/                   tabela, filtros, drawer, botão copiar
  lib/
    sessao.ts                   exigirAcesso() / exigirAdmin()
    supabase-usuario.ts         client com sessão (RLS vale)
    supabase.ts                 client service_role (ignora RLS)
    anthropic.ts pitch.ts …
supabase/
  migrations/0001_init.sql      schema base
  migrations/0002_auth_saas.sql auth, perfis e RLS
  tests/                        harness + asserções de RLS
scripts/
  seed.sql                      empreendimentos placeholder
  testar-rls.sh                 roda os testes de RLS
```
