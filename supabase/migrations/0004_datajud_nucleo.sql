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
