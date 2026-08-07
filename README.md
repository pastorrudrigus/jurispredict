# Radar Imob Goiânia

Ferramenta interna de operação para capturar **repasses / cessão de direitos de
imóveis na planta em Goiânia**, estruturar cada anúncio com IA e entregar a
lista pronta ao corretor por WhatsApp.

O corretor é o cliente; a dor dele é **captação**, não lead de comprador. Os
anúncios ficam pulverizados em grupos de WhatsApp, Facebook e OLX — nenhum
portal os indexa. Este painel transforma esse estoque-sombra em deal flow.

> **MVP de um dia.** Hoje é ferramenta interna: o operador cola anúncios brutos,
> a IA estrutura, o painel organiza e o operador envia a lista a corretores
> parceiros. Sem login de corretor, sem cobrança, sem crawler.

---

## Stack

| Camada    | Escolha |
|-----------|---------|
| App       | Next.js 14 (App Router, TypeScript), deploy na Vercel |
| Dados     | Supabase (Postgres). Acesso só via `service_role` em server actions |
| IA        | API da Anthropic, modelo `claude-sonnet-4-6` (`@anthropic-ai/sdk`) |
| UI        | Tailwind CSS |
| Proteção  | Middleware com senha única em env var (`ADMIN_PASSWORD`) |

---

## Setup

### 1. Banco

Crie um projeto no Supabase e rode, no SQL Editor:

1. `supabase/migrations/0001_init.sql` — tabelas, índices, `unaccent_safe`,
   `match_empreendimento` e a tabela `sinais_judiciais` (P1).
2. `scripts/seed.sql` — **20 empreendimentos placeholder**, todos fictícios e
   marcados como tal. Substitua pelos reais (sites de FGR, Opus, EBM, Sim,
   Terral…) antes de operar; a base de empreendimentos é o que faz o fuzzy match
   e a data de entrega no pitch funcionarem.

### 2. Variáveis de ambiente

Copie `.env.example` para `.env.local` (e replique na Vercel):

```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=   # service_role — só server-side, nunca NEXT_PUBLIC_
ANTHROPIC_API_KEY=
ADMIN_PASSWORD=         # senha do painel
```

Opcionais (P1 — DataJud): `DATAJUD_API_KEY`, `CRON_SECRET`,
`DATAJUD_MUNICIPIO_IBGE`.

### 3. Rodar

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # produção
```

---

## Como funciona

### `/ingerir` — caixa de ingestão

Cole um ou vários anúncios brutos, separados por uma linha contendo apenas
`---`. Escolha a fonte (whatsapp/facebook/olx/instagram/outro) e, opcionalmente,
a URL de origem.

Para cada anúncio, sequencialmente:

1. **Dedup** — `hash_dedup = md5(fonte + texto normalizado)`. Se já existe,
   marca ⚠️ duplicado e pula (sem gastar token de IA).
2. **Extração** — chamada à Anthropic (`claude-sonnet-4-6`, `max_tokens: 1024`)
   com o prompt de extração. Parse defensivo: tira cercas ```` ```json ````,
   recorta do primeiro `{` ao último `}`, normaliza números e telefone.
3. **`eh_repasse=false`** → grava com `status='invalido'` (auditoria), marca ❌.
4. **Fuzzy match** — `rpc('match_empreendimento')` via `pg_trgm`; vincula se
   `similarity >= 0.35`.
5. **Insert** e devolve o resumo do item.

O lote roda em blocos de 20 com barra de progresso. **Erro em um item nunca
derruba o lote** — ele aparece como 💥 com a mensagem, e o processamento segue.

### `/` — painel de leads

Tabela densa ordenada por `score_urgencia desc`. Filtros de bairro, status,
urgência mínima e busca textual. Contadores no header: total, novos hoje,
urgentes (≥61). Clique na linha abre o drawer com **todos** os campos, o
`texto_bruto` e as ações: mudar status, **copiar pitch** e **enviar via
WhatsApp** (`wa.me`). Checkboxes selecionam leads e mandam para `/lista`.

Cores do score: verde ≥61, amarelo 31-60, cinza <31.

### `/lista` — gerador de lista para corretor

Recebe a seleção do painel (`?ids=…`) ou filtra diretamente. Gera uma mensagem
única com N oportunidades numeradas, botão de copiar e botão wa.me. Depois de
copiar/enviar, oferece marcar os leads como `distribuido`.

### `/empreendimentos` — CRUD

Listar, criar, editar e excluir a base que alimenta o fuzzy match.

### `/api/cron/datajud` (P1, opcional)

Consulta o DataJud do TJGO (`api_publica_tjgo/_search`, header
`Authorization: APIKey …`) buscando classes/assuntos de rescisão, execução,
inventário e divórcio com `dataAjuizamento >= 2023-01-01`, filtrando por
município. Grava em `sinais_judiciais` (payload jsonb) e o painel mostra
"Distratos ajuizados em Goiânia: N desde 2023" como card de estatística.

A rota fica **fora** do middleware de senha e se protege com `CRON_SECRET`
(`Authorization: Bearer …`, que é o que o cron da Vercel envia). Sem
`DATAJUD_API_KEY` ela responde 503 e o card simplesmente não aparece.
O agendamento diário está em `vercel.json`.

---

## Formato do pitch

Lead individual (linhas sem dado são omitidas):

```
🏢 *Residencial Exemplo* — Setor Bueno
2 quartos, 62 m²
💰 Pedido: R$ 80.000 (-11% vs pago)
📈 Já pago: R$ 90.000 | Saldo: R$ 320.000
🔥 Urgência: 78/100 — vai mudar de estado, abaixo do valor pago
🗓 Entrega prevista: 30/06/2026
Fonte: whatsapp, captado há 2h
```

Lista: cabeçalho `Radar Imob — {data} — {N} oportunidades em Goiânia` + itens
numerados compactos.

---

## Segurança

- `SUPABASE_SERVICE_KEY` e `ANTHROPIC_API_KEY` são lidas **só** em código de
  servidor. `src/lib/supabase.ts` e `src/lib/anthropic.ts` importam
  `server-only`, então o build quebra se algum componente client os importar.
  Verificado com build de canário: nenhum segredo aparece em `.next/static`.
- A senha do painel nunca vai para o client. O cookie guarda um SHA-256 de
  `salt|senha`; o middleware recalcula e compara em tempo constante. Cookie
  `httpOnly`, `sameSite=lax`, `secure` em produção.
- **O middleware fica em `src/middleware.ts`**, não na raiz — projetos com
  diretório `src/` ignoram um `middleware.ts` na raiz e o painel fica aberto.

### Dívida técnica conhecida

- **RLS está desligado** em todas as tabelas. Isso só é aceitável porque o
  acesso é exclusivamente via `service_role` em server actions, atrás do
  middleware de senha. Antes de qualquer login de corretor ou multi-tenant:
  ligar RLS e escrever políticas por tenant.
- Senha única compartilhada, sem usuários, sem auditoria de quem fez o quê.
- `npm audit` acusa 2 vulnerabilidades altas em `postcss` **transitivo do
  próprio Next 14** (usado só no build, não em runtime). Só some ao migrar para
  Next 16, que é breaking change — fora do escopo do MVP.

---

## Fora de escopo hoje (roadmap)

- Crawler automatizado de OLX e Facebook (hoje a captação é manual, copy-paste)
- Login de corretores, cobrança e exclusividade territorial
- Matrículas / SAEC
- Score treinado por feedback real de conversão (hoje é o julgamento do modelo)
- RLS multi-tenant
- Filas, workers, Redis, testes e2e, i18n

---

## Estrutura

```
src/
  middleware.ts               proteção por senha (precisa ficar aqui, não na raiz)
  app/
    page.tsx                  painel de leads
    ingerir/                  caixa de ingestão + form client
    lista/                    gerador de lista para corretor
    empreendimentos/          CRUD
    login/                    tela e actions de sessão
    api/cron/datajud/         coleta DataJud TJGO (P1)
    actions/                  server actions (ingest, leads, empreendimentos)
  components/                 tabela, filtros, drawer, botão copiar
  lib/                        supabase, anthropic, pitch, format, split, auth
supabase/migrations/          migration única
scripts/seed.sql              empreendimentos placeholder
```
