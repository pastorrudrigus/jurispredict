\set ON_ERROR_STOP on
\pset pager off

-- ---------------------------------------------------------------- dados ----
insert into auth.users (email, raw_user_meta_data) values
  ('admin@x',  '{"nome":"Operador"}'),
  ('ativo@x',  '{"nome":"Corretora Ativa","telefone":"62999990001","creci":"12345"}'),
  ('pend@x',   '{"nome":"Corretor Pendente"}'),
  ('susp@x',   '{"nome":"Corretor Suspenso"}');

update perfis set papel = 'admin', status_acesso = 'ativo' where email = 'admin@x';
update perfis set status_acesso = 'ativo'    where email = 'ativo@x';
update perfis set status_acesso = 'suspenso' where email = 'susp@x';
-- pend@x fica no default: pendente

insert into empreendimentos (nome, bairro) values ('Residencial Teste', 'Setor Bueno');

insert into anuncios_repasse (fonte, hash_dedup, texto_bruto, status, score_urgencia, telefone_contato) values
  ('whatsapp', 'h1', 'repasse novo',        'novo',        80, '62999990000'),
  ('whatsapp', 'h2', 'lixo nao repasse',    'invalido',     0, null),
  ('whatsapp', 'h3', 'repasse velho',       'expirado',    40, '62999990002'),
  ('whatsapp', 'h4', 'repasse distribuido', 'distribuido', 70, '62999990003');

-- ------------------------------------------------------------- helpers ----
create or replace function como(p_email text) returns void
language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  perform set_config('request.jwt.claim.sub', v_id::text, true);
end $$;

create or replace function checa(rotulo text, obtido bigint, esperado bigint) returns void
language plpgsql as $$
begin
  if obtido is distinct from esperado then
    raise exception 'FALHOU: % -> obtido %, esperado %', rotulo, obtido, esperado;
  end if;
  raise notice 'ok  %  (=%)', rpad(rotulo, 52), obtido;
end $$;

-- =================== LEITURA DO POOL ========================================
begin;
  select como('ativo@x');
  set local role authenticated;
  select checa('corretor ativo ve o pool (novo+distribuido)',
               (select count(*) from anuncios_repasse), 2);
  select checa('corretor ativo NAO ve invalido',
               (select count(*) from anuncios_repasse where status = 'invalido'), 0);
  select checa('corretor ativo NAO ve expirado',
               (select count(*) from anuncios_repasse where status = 'expirado'), 0);
  select checa('corretor ativo le empreendimentos',
               (select count(*) from empreendimentos), 1);
  select checa('corretor ativo ve so o proprio perfil',
               (select count(*) from perfis), 1);
commit;

begin;
  select como('pend@x');
  set local role authenticated;
  select checa('corretor PENDENTE nao ve nenhum lead',
               (select count(*) from anuncios_repasse), 0);
  select checa('corretor PENDENTE nao ve empreendimentos',
               (select count(*) from empreendimentos), 0);
commit;

begin;
  select como('susp@x');
  set local role authenticated;
  select checa('corretor SUSPENSO nao ve nenhum lead',
               (select count(*) from anuncios_repasse), 0);
commit;

begin;
  select como('admin@x');
  set local role authenticated;
  select checa('admin ve TODOS os leads (inclusive invalido)',
               (select count(*) from anuncios_repasse), 4);
  select checa('admin ve todos os perfis',
               (select count(*) from perfis), 4);
commit;

-- =================== ESCRITA ================================================
begin;
  select como('ativo@x');
  set local role authenticated;
  with u as (update anuncios_repasse set status = 'vendido' where status = 'novo' returning 1)
  select checa('corretor NAO consegue alterar lead', (select count(*) from u), 0);
commit;

do $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = 'ativo@x';
  perform set_config('request.jwt.claim.sub', v_id::text, false);
  set local role authenticated;
  begin
    insert into empreendimentos (nome) values ('invasao');
    raise exception 'FALHOU: corretor conseguiu inserir empreendimento';
  exception when insufficient_privilege then
    raise notice 'ok  %  (RLS barrou o insert)', rpad('corretor NAO insere empreendimento', 52);
  end;
end $$;

-- escalada de privilegio: corretor tentando se auto-aprovar / virar admin
begin;
  select como('pend@x');
  set local role authenticated;
  with u as (update perfis set status_acesso = 'ativo' where id = auth.uid() returning 1)
  select checa('corretor NAO se auto-aprova', (select count(*) from u), 0);
  with u as (update perfis set papel = 'admin' where id = auth.uid() returning 1)
  select checa('corretor NAO se promove a admin', (select count(*) from u), 0);
commit;

begin;
  select como('admin@x');
  set local role authenticated;
  with u as (update perfis set status_acesso = 'ativo' where email = 'pend@x' returning 1)
  select checa('admin aprova corretor', (select count(*) from u), 1);
  with u as (update anuncios_repasse set status = 'validado' where status = 'novo' returning 1)
  select checa('admin altera lead', (select count(*) from u), 1);
rollback;

-- =================== ANON (visitante sem login) =============================
do $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  set local role anon;
  begin
    perform count(*) from anuncios_repasse;
    raise exception 'FALHOU: anon conseguiu ler anuncios_repasse';
  exception when insufficient_privilege then
    raise notice 'ok  %  (sem GRANT)', rpad('anon NAO le anuncios_repasse', 52);
  end;
end $$;

-- =================== fuzzy match ainda funciona =============================
begin;
  select como('admin@x');
  set local role authenticated;
  select checa('match_empreendimento acha por texto aproximado',
               (select count(*) from match_empreendimento('residencial teste') where sim >= 0.35), 1);
commit;

\echo ''
\echo '===== TODOS OS TESTES DE RLS PASSARAM ====='
