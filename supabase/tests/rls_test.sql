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


-- ═══════════ 0004: classificador de anunciante + núcleo judicial ═══════════
insert into anuncios_repasse (fonte, hash_dedup, texto_bruto, status, score_urgencia,
                              telefone_contato, anunciante_tipo, anunciante_confianca) values
  ('whatsapp','h10','dono com pressa','novo',        70,'62900000010','proprietario',90),
  ('whatsapp','h11','corretor com carteira','benchmark',10,'62900000011','corretor',95),
  -- mesmo telefone em 3 anúncios: profissional disfarçado de dono
  ('whatsapp','h12','anuncio a','novo',50,'62900000099','proprietario',80),
  ('whatsapp','h13','anuncio b','novo',50,'62900000099','proprietario',80),
  ('whatsapp','h14','anuncio c','novo',50,'62900000099','proprietario',80);

begin;
  select como('ativo@x');
  set local role authenticated;
  select checa('corretor NAO ve anuncio marcado benchmark',
               (select count(*) from anuncios_repasse where status = 'benchmark'), 0);
  select checa('corretor NAO ve leads_judiciais',
               (select count(*) from leads_judiciais), 0);
  select checa('corretor le a watchlist de construtoras',
               (select count(*) from construtoras_watchlist), 7);
commit;

select checa('telefone repetido 3x reclassifica como corretor',
             reclassificar_anunciantes_por_telefone(3)::bigint, 3);
select checa('reclassificacao gravou o tipo',
             (select count(*) from anuncios_repasse
               where telefone_contato = '62900000099' and anunciante_tipo = 'corretor'), 3);
select checa('reclassificacao NAO toca em quem tem telefone unico',
             (select count(*) from anuncios_repasse
               where telefone_contato = '62900000010' and anunciante_tipo = 'proprietario'), 1);
select checa('rodar de novo nao mexe em nada (idempotente)',
             reclassificar_anunciantes_por_telefone(3)::bigint, 0);

-- janela crítica pré-chaves: -6 a +8 meses da entrega
select checa('entrega em 3 meses esta na janela',
             (select count(*) where na_janela_critica((current_date + interval '3 months')::date)), 1);
select checa('entrega ha 3 meses ainda esta na janela',
             (select count(*) where na_janela_critica((current_date - interval '3 months')::date)), 1);
select checa('entrega em 20 meses esta FORA da janela',
             (select count(*) where na_janela_critica((current_date + interval '20 months')::date)), 0);
select checa('entrega ha 2 anos esta FORA da janela',
             (select count(*) where na_janela_critica((current_date - interval '24 months')::date)), 0);
select checa('empreendimento sem data de entrega nao entra na janela',
             (select count(*) where na_janela_critica(null)), 0);

-- cruzamento âncora anúncio × processo
insert into sinais_judiciais (numero_processo, categoria, comarca)
  values ('5000001-11.2026.8.09.0051','execucao','Goiânia');
insert into leads_judiciais (sinal_id, tipo_oportunidade, pessoa_alvo, score_oportunidade)
  select id, 'vendedor_pressionado', 'Maria Exemplo da Silva', 80 from sinais_judiciais limit 1;
update anuncios_repasse set nome_contato = 'MARIA EXEMPLO DA SILVA'
 where hash_dedup = 'h10';

select checa('cruzamento acha anunciante que tambem e parte no processo',
             (select count(*) from cruzar_anuncios_com_judiciais()), 1);
select checa('cruzamento leva o anuncio para urgencia 100',
             aplicar_cruzamento_judicial()::bigint, 1);
select checa('score 100 gravado no anuncio cruzado',
             (select score_urgencia from anuncios_repasse where hash_dedup = 'h10')::bigint, 100);
\echo ''
\echo '===== TODOS OS TESTES PASSARAM ====='
