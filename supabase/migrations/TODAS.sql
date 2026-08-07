-- GERADO por scripts/juntar-migrations.sh — não edite à mão.
-- Cole este arquivo INTEIRO no SQL Editor do Supabase, de uma vez.
-- A ordem importa: 0002 depende de 0001; 0004 depende de 0002.

-- ═════════════════════════════════════════════════════════
-- 0001_init.sql
-- ═════════════════════════════════════════════════════════

-- Radar Imob Goiânia — migration única.
-- Rodar no SQL Editor do Supabase antes do primeiro deploy.

create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;

create or replace function unaccent_safe(t text) returns text
language sql immutable as $$
  select translate(lower(coalesce(t,'')),
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn');
$$;

create table empreendimentos (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  nome_normalizado text generated always as (unaccent_safe(nome)) stored,
  construtora text,
  bairro text,
  cidade text default 'Goiânia',
  data_entrega_prevista date,
  fase_obra text,
  total_unidades int,
  financiamento_proprio boolean default false,
  fonte text,
  criado_em timestamptz default now()
);
create index idx_emp_trgm on empreendimentos using gin (nome_normalizado gin_trgm_ops);

create table anuncios_repasse (
  id uuid primary key default uuid_generate_v4(),
  fonte text not null default 'whatsapp',
  url_original text,
  hash_dedup text unique,
  texto_bruto text not null,
  empreendimento_id uuid references empreendimentos(id),
  empreendimento_texto text,
  bairro text,
  tipologia text,
  area_m2 numeric,
  valor_pago numeric,
  valor_pedido numeric,
  saldo_devedor numeric,
  fase_obra_mencionada text,
  telefone_contato text,
  nome_contato text,
  score_urgencia int,
  sinais_urgencia text[] default '{}',
  status text default 'novo',   -- novo|validado|distribuido|vendido|expirado|invalido
  extraido_em timestamptz,
  modelo_extracao text,
  criado_em timestamptz default now()
);
create index idx_anuncio_lista on anuncios_repasse (status, score_urgencia desc, criado_em desc);

create or replace function match_empreendimento(busca text)
returns table (id uuid, nome text, sim real)
language sql stable as $$
  select e.id, e.nome, similarity(e.nome_normalizado, unaccent_safe(busca)) as sim
  from empreendimentos e
  order by sim desc
  limit 1;
$$;

-- P1 — sinais judiciais (DataJud TJGO). Populada por /api/cron/datajud.
create table sinais_judiciais (
  id uuid primary key default uuid_generate_v4(),
  fonte text not null default 'datajud_tjgo',
  numero_processo text unique,
  classe text,
  assunto text,
  data_ajuizamento date,
  municipio text,
  payload jsonb,
  criado_em timestamptz default now()
);
create index idx_sinais_data on sinais_judiciais (data_ajuizamento desc);

-- DÍVIDA TÉCNICA: RLS está DESLIGADO em todas as tabelas acima.
-- O acesso hoje é exclusivamente via service_role em server actions, atrás do
-- middleware de senha. Antes de qualquer login de corretor / multi-tenant,
-- habilitar RLS e escrever políticas por tenant.

-- ═════════════════════════════════════════════════════════
-- 0002_auth_saas.sql
-- ═════════════════════════════════════════════════════════

-- ============================================================================
-- 0002 — Auth self-service + RLS (modelo: POOL COMPARTILHADO)
-- ============================================================================
-- Troca a senha única do painel por Supabase Auth:
--   * corretor se cadastra sozinho  -> perfil nasce `pendente`
--   * admin (operador) aprova       -> perfil vira `ativo` e passa a ver o pool
--   * o pool de leads é ÚNICO: quem ingere é o admin, todo corretor ativo lê
--     o mesmo estoque. Não há dono por lead.
--
-- A partir daqui o RLS é REAL: as leituras do app usam a anon key com a sessão
-- do usuário. A service_role continua existindo (ingestão, cron) e continua
-- ignorando RLS por definição — por isso ela só é usada em caminhos que já
-- checaram `exigirAdmin()` no servidor.
--
-- Rode DEPOIS de 0001_init.sql.
-- ============================================================================

-- ---------------------------------------------------------------- perfis ----
create table perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nome text,
  telefone text,
  creci text,
  papel text not null default 'corretor' check (papel in ('admin', 'corretor')),
  status_acesso text not null default 'pendente'
    check (status_acesso in ('pendente', 'ativo', 'suspenso')),
  criado_em timestamptz default now()
);
create index idx_perfis_status on perfis (status_acesso, criado_em desc);

-- Perfil nasce junto com o usuário do Auth, com os dados do cadastro.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, email, nome, telefone, creci)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'nome', ''),
    nullif(new.raw_user_meta_data->>'telefone', ''),
    nullif(new.raw_user_meta_data->>'creci', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- --------------------------------------------------- helpers de política ----
-- security definer: leem `perfis` sem disparar as políticas de `perfis`,
-- evitando recursão infinita no RLS.
create or replace function perfil_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from perfis where id = auth.uid();
$$;

create or replace function perfil_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select status_acesso = 'ativo' from perfis where id = auth.uid()),
    false
  );
$$;

create or replace function eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select papel = 'admin' and status_acesso = 'ativo' from perfis where id = auth.uid()),
    false
  );
$$;

-- ------------------------------------------------------------ RLS: on -------
alter table perfis            enable row level security;
alter table anuncios_repasse  enable row level security;
alter table empreendimentos   enable row level security;
alter table sinais_judiciais  enable row level security;

-- perfis: cada um vê o seu; admin vê e edita todos.
create policy perfis_leitura_propria on perfis
  for select to authenticated
  using (id = auth.uid() or eh_admin());

create policy perfis_admin_escreve on perfis
  for update to authenticated
  using (eh_admin()) with check (eh_admin());

create policy perfis_admin_apaga on perfis
  for delete to authenticated
  using (eh_admin());

-- anúncios: corretor ativo lê o pool, menos o lixo de auditoria.
-- `invalido` e `expirado` ficam só para o admin.
create policy anuncios_pool_leitura on anuncios_repasse
  for select to authenticated
  using (
    perfil_ativo()
    and (eh_admin() or status in ('novo', 'validado', 'distribuido', 'vendido'))
  );

create policy anuncios_admin_escreve on anuncios_repasse
  for all to authenticated
  using (eh_admin()) with check (eh_admin());

-- empreendimentos: todo mundo ativo lê; só admin escreve.
create policy emp_leitura on empreendimentos
  for select to authenticated
  using (perfil_ativo());

create policy emp_admin_escreve on empreendimentos
  for all to authenticated
  using (eh_admin()) with check (eh_admin());

-- sinais judiciais: leitura para ativos; escrita só via service_role (cron),
-- que ignora RLS — por isso não existe policy de escrita aqui.
create policy sinais_leitura on sinais_judiciais
  for select to authenticated
  using (perfil_ativo());

-- ------------------------------------------------------------- grants -------
-- Sem RLS, GRANT sozinho liberaria tudo; com RLS ligado acima, o GRANT é só o
-- primeiro portão e as policies decidem linha a linha.
grant usage on schema public to authenticated;
grant select on empreendimentos, anuncios_repasse, sinais_judiciais to authenticated;
grant insert, update, delete on empreendimentos, anuncios_repasse to authenticated;
grant select, update, delete on perfis to authenticated;

-- ============================================================================
-- PROMOVER O PRIMEIRO ADMIN — rode à mão depois de se cadastrar pela tela:
--
--   update perfis
--      set papel = 'admin', status_acesso = 'ativo'
--    where email = 'seu-email@exemplo.com';
--
-- Sem isso NINGUÉM é admin e o /ingerir fica inacessível.
-- ============================================================================

-- ═════════════════════════════════════════════════════════
-- 0003_anunciado_em.sql
-- ═════════════════════════════════════════════════════════

-- ============================================================================
-- 0003 — data real do anúncio
-- ============================================================================
-- `criado_em` é quando o lead entrou no banco, não quando o anúncio foi
-- publicado. Um export de WhatsApp pode ter 3 semanas: sem esta coluna, todo
-- anúncio antigo apareceria como "há 2min" no painel e o corretor perseguiria
-- estoque morto achando que era quente.
--
-- Fica NULL para ingestão manual sem data conhecida; a UI cai para criado_em.
-- ============================================================================

alter table anuncios_repasse
  add column anunciado_em timestamptz;

comment on column anuncios_repasse.anunciado_em is
  'Quando o anúncio foi publicado na origem (ex.: timestamp da mensagem no grupo). NULL = desconhecido, usar criado_em.';

-- A ordenação do painel passa a considerar a data real quando ela existe.
create index idx_anuncio_idade
  on anuncios_repasse (coalesce(anunciado_em, criado_em) desc);

-- ═════════════════════════════════════════════════════════
-- 0004_datajud_nucleo.sql
-- ═════════════════════════════════════════════════════════

-- ============================================================================
-- 0004 — Classificador de anunciante (Parte A) + núcleo DataJud (Parte B)
--        + janela crítica pré-chaves (Parte C)
-- ============================================================================

-- ─────────────────────────────── PARTE A ───────────────────────────────────
alter table anuncios_repasse add column anunciante_tipo text
  default 'indefinido'
  check (anunciante_tipo in ('proprietario','corretor','imobiliaria','indefinido'));
alter table anuncios_repasse add column anunciante_confianca int
  check (anunciante_confianca between 0 and 100);
alter table anuncios_repasse add column sinais_anunciante text[] default '{}';

create index idx_anuncio_fone on anuncios_repasse (telefone_contato)
  where telefone_contato is not null;
create index idx_anuncio_classe on anuncios_repasse (anunciante_tipo, score_urgencia desc);

/*
 * Sinal forte pós-extração: o mesmo telefone em 3+ anúncios distintos é
 * profissional, por mais que o texto se apresente como dono. Heurística de
 * banco de propósito — é evidência que a IA não tem ao ler UM anúncio isolado.
 *
 * Roda depois de cada lote, não como trigger por linha: com trigger, cada
 * insert varreria a tabela inteira.
 */
create or replace function reclassificar_anunciantes_por_telefone(
  min_ocorrencias int default 3
) returns int
language plpgsql as $$
declare afetados int;
begin
  with repetidos as (
    select telefone_contato
      from anuncios_repasse
     where telefone_contato is not null
     group by telefone_contato
    having count(distinct id) >= min_ocorrencias
  )
  update anuncios_repasse a
     set anunciante_tipo = 'corretor',
         anunciante_confianca = 90,
         sinais_anunciante =
           (select array_agg(distinct s)
              from unnest(
                coalesce(a.sinais_anunciante, '{}') ||
                array['telefone repetido em 3+ anúncios']
              ) s)
    from repetidos r
   where a.telefone_contato = r.telefone_contato
     and a.anunciante_tipo is distinct from 'corretor';

  get diagnostics afetados = row_count;
  return afetados;
end $$;

-- ─────────────────────────────── PARTE C ───────────────────────────────────
/*
 * Janela crítica pré-chaves: de 8 meses ANTES a 6 meses DEPOIS da entrega.
 * É quando o comprador enfrenta o "muro das chaves" — precisa de aprovação
 * bancária para o saldo corrigido por INCC. Reprovado, ou distrata (caro) ou
 * repassa o contrato. O repasse é o nosso lead.
 */
create or replace function meses_ate_entrega(entrega date)
returns int language sql stable as $$
  select case when entrega is null then null
         else (extract(year from age(entrega, current_date)) * 12
             + extract(month from age(entrega, current_date)))::int
         end;
$$;

create or replace function na_janela_critica(entrega date)
returns boolean language sql stable as $$
  select case when entrega is null then false
         else meses_ate_entrega(entrega) between -6 and 8
         end;
$$;

create or replace view empreendimentos_janela as
  select e.*,
         meses_ate_entrega(e.data_entrega_prevista) as meses_ate_entrega,
         na_janela_critica(e.data_entrega_prevista) as na_janela_critica
    from empreendimentos e;

-- ─────────────────────────────── PARTE B ───────────────────────────────────
-- sinais_judiciais ganha o que o pipeline de 3 estágios precisa.
alter table sinais_judiciais add column categoria text;
alter table sinais_judiciais add column comarca text;
alter table sinais_judiciais add column valor_causa numeric;
alter table sinais_judiciais add column ultima_atualizacao timestamptz;
alter table sinais_judiciais add column sigiloso boolean default false;
alter table sinais_judiciais add column status_enriquecimento text
  default 'pendente'
  check (status_enriquecimento in ('pendente','enriquecido','sigiloso','falhou','ignorado'));

create index idx_sinais_fila
  on sinais_judiciais (status_enriquecimento, ultima_atualizacao desc);
create index idx_sinais_categoria on sinais_judiciais (categoria, comarca);

create table construtoras_watchlist (
  id serial primary key,
  nome text unique not null,
  -- razões sociais e SPEs conhecidas; o nome da SPE costuma carregar o nome
  -- do empreendimento, o que permite inferir a unidade a partir do processo.
  apelidos text[] default '{}'
);

create table partes_processo (
  id uuid primary key default uuid_generate_v4(),
  sinal_id uuid not null references sinais_judiciais(id) on delete cascade,
  polo text check (polo in ('ativo','passivo')),
  nome text,
  tipo_pessoa text check (tipo_pessoa in ('fisica','juridica')),
  eh_construtora boolean default false,
  eh_condominio boolean default false,
  construtora_id int references construtoras_watchlist(id),
  criado_em timestamptz default now()
);
create index idx_partes_sinal on partes_processo (sinal_id);
create index idx_partes_construtora on partes_processo (eh_construtora) where eh_construtora;

create table leads_judiciais (
  id uuid primary key default uuid_generate_v4(),
  sinal_id uuid references sinais_judiciais(id) on delete cascade,
  tipo_oportunidade text check (tipo_oportunidade in (
    'unidade_voltando_estoque',
    'vendedor_pressionado',
    'herdeiros_vendendo',
    'leilao_agendado'
  )),
  empreendimento_id uuid references empreendimentos(id),
  pessoa_alvo text,
  score_oportunidade int check (score_oportunidade between 0 and 100),
  resumo text,
  proximo_passo text,
  status text default 'novo'
    check (status in ('novo','em_contato','convertido','descartado')),
  criado_em timestamptz default now()
);
create index idx_leads_jud_score on leads_judiciais (status, score_oportunidade desc, criado_em desc);
create unique index idx_leads_jud_sinal on leads_judiciais (sinal_id, tipo_oportunidade);

-- ──────────────────── Cruzamento âncora: anúncio × processo ────────────────
/*
 * O diferencial que nenhum portal tem: a mesma pessoa aparecendo como
 * anunciante E como parte pressionada num processo. Quem está vendendo E
 * sendo executado tem urgência real, não urgência de marketing.
 *
 * Casa por telefone (quando o enriquecedor capturar) e por nome normalizado.
 */
create or replace function cruzar_anuncios_com_judiciais()
returns table (anuncio_id uuid, lead_judicial_id uuid, motivo text)
language sql stable as $$
  select a.id, lj.id,
         case when a.nome_contato is not null
                   and unaccent_safe(a.nome_contato) = unaccent_safe(lj.pessoa_alvo)
              then 'nome do anunciante confere com a parte do processo'
              else 'pessoa-alvo confere' end
    from anuncios_repasse a
    join leads_judiciais lj
      on lj.pessoa_alvo is not null
     and a.nome_contato is not null
     and unaccent_safe(a.nome_contato) = unaccent_safe(lj.pessoa_alvo)
   where a.status not in ('invalido','expirado')
     and a.anunciante_tipo = 'proprietario';
$$;

/** Aplica o cruzamento: anúncio de proprietário que bate com processo vai a 100. */
create or replace function aplicar_cruzamento_judicial() returns int
language plpgsql as $$
declare afetados int;
begin
  update anuncios_repasse a
     set score_urgencia = 100,
         sinais_urgencia =
           (select array_agg(distinct s) from unnest(
              coalesce(a.sinais_urgencia,'{}') ||
              array['também é parte em processo judicial']) s)
    from (select distinct anuncio_id from cruzar_anuncios_com_judiciais()) c
   where a.id = c.anuncio_id
     and a.score_urgencia is distinct from 100;
  get diagnostics afetados = row_count;
  return afetados;
end $$;

-- ─────────────────────────────── RLS ───────────────────────────────────────
alter table construtoras_watchlist enable row level security;
alter table partes_processo        enable row level security;
alter table leads_judiciais        enable row level security;

/*
 * DECISÃO DELIBERADA: dados judiciais são ADMIN-ONLY por enquanto.
 * `partes_processo` e `leads_judiciais` carregam nome de pessoa física
 * envolvida em execução, inventário e busca e apreensão. Expor isso a toda a
 * base de corretores é exposição de dado pessoal sensível por contexto, sem
 * base legal definida. O corretor vê os AGREGADOS (contagens por
 * construtora/empreendimento), não as pessoas.
 * Revisar quando houver base legal e opt-out desenhados.
 */
create policy watchlist_leitura on construtoras_watchlist
  for select to authenticated using (perfil_ativo());
create policy watchlist_admin on construtoras_watchlist
  for all to authenticated using (eh_admin()) with check (eh_admin());

create policy partes_admin on partes_processo
  for all to authenticated using (eh_admin()) with check (eh_admin());

create policy leads_jud_admin on leads_judiciais
  for all to authenticated using (eh_admin()) with check (eh_admin());

grant select on construtoras_watchlist, empreendimentos_janela to authenticated;
grant insert, update, delete on construtoras_watchlist to authenticated;
grant select, insert, update, delete on partes_processo, leads_judiciais to authenticated;
grant usage, select on sequence construtoras_watchlist_id_seq to authenticated;

-- ──────────────────────── seed da watchlist ────────────────────────────────
/*
 * Construtoras que o operador quer monitorar no polo das ações. `apelidos`
 * precisa ser preenchido com as SPEs reais (o CNPJ/razão social que aparece
 * nos autos raramente é o nome comercial) — sem isso o matcher de polo erra.
 */
insert into construtoras_watchlist (nome) values
  ('FGR'), ('Opus'), ('EBM'), ('Sim'), ('Terral'), ('City'), ('Dinâmica')
on conflict (nome) do nothing;
