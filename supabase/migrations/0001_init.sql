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
