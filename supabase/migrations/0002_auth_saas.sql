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
