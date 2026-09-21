-- =============================================================================
-- Testes de RLS do Full Hub
--
-- Verifica o isolamento por client_id e o bloqueio de escalacao de privilegio.
-- Roda contra um Postgres limpo que ja tenha recebido a migration inicial.
-- Ver supabase/tests/README.md para o passo a passo.
--
-- Qualquer falha aborta com ON_ERROR_STOP=1 — silencio total significa aprovado.
-- =============================================================================

\set ON_ERROR_STOP on
\pset tuples_only on

begin;

-- ---------------------------------------------------------------------------
-- Massa de teste
-- ---------------------------------------------------------------------------
-- Contas criadas pela API de admin: o role vai em raw_app_meta_data.
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'socio@teste.com.br',    '{"nome":"Socio"}',     '{"role":"socio"}'),
  ('00000000-0000-0000-0000-00000000000b', 'colab@teste.com.br',    '{"nome":"Colab"}',     '{"role":"colaborador"}'),
  ('00000000-0000-0000-0000-00000000000c', 'clientea@teste.com.br', '{"nome":"Cliente A"}', '{"role":"cliente"}'),
  ('00000000-0000-0000-0000-00000000000d', 'clienteb@teste.com.br', '{"nome":"Cliente B"}', '{"role":"cliente"}');

insert into public.clients (id, nome_empresa) values
  ('11111111-1111-1111-1111-111111111111', 'Empresa A'),
  ('22222222-2222-2222-2222-222222222222', 'Empresa B');

insert into public.client_users (client_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000000d');

insert into public.team_members (user_id, cargo, area) values
  ('00000000-0000-0000-0000-00000000000b', 'Analista', 'Operacoes');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function pg_temp.entrar_como(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function pg_temp.checar(p_condicao boolean, p_descricao text) returns void
language plpgsql as $$
begin
  if not p_condicao then
    raise exception 'FALHOU: %', p_descricao;
  end if;
  raise notice 'ok — %', p_descricao;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. O trigger de auth provisiona public.users
-- ---------------------------------------------------------------------------
select pg_temp.checar(
  (select count(*) from public.users) = 4,
  'toda conta criada no auth ganha linha em public.users');

select pg_temp.checar(
  (select role from public.users where email = 'socio@teste.com.br') = 'socio',
  'o role vem do metadata de admin (raw_app_meta_data)');

-- Cadastro publico tentando escolher o proprio perfil: o role pedido em
-- raw_user_meta_data tem que ser ignorado.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000e', 'esperto@teste.com.br', '{"nome":"Esperto","role":"socio"}');

select pg_temp.checar(
  (select role from public.users where email = 'esperto@teste.com.br') = 'cliente',
  'cadastro publico nao consegue escolher o proprio role');

-- Metadata com valor invalido nao pode derrubar a criacao da conta.
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000000000f', 'invalido@teste.com.br', '{"role":"superadmin"}');

select pg_temp.checar(
  (select role from public.users where email = 'invalido@teste.com.br') = 'cliente',
  'role invalido no metadata cai para cliente sem quebrar o cadastro');

-- ---------------------------------------------------------------------------
-- 2. Isolamento por client_id
-- ---------------------------------------------------------------------------
select pg_temp.entrar_como('00000000-0000-0000-0000-00000000000c');

select pg_temp.checar(
  (select count(*) from public.clients) = 1
  and (select nome_empresa from public.clients) = 'Empresa A',
  'cliente A enxerga apenas a propria empresa');

select pg_temp.checar(
  (select count(*) from public.team_members) = 0,
  'cliente nao enxerga dados de RH da equipe');

select pg_temp.checar(
  (select count(*) from public.users) = 1,
  'cliente enxerga apenas o proprio usuario');

select pg_temp.entrar_como('00000000-0000-0000-0000-00000000000d');

select pg_temp.checar(
  (select nome_empresa from public.clients) = 'Empresa B',
  'cliente B enxerga apenas a propria empresa');

-- ---------------------------------------------------------------------------
-- 3. Equipe interna enxerga tudo
-- ---------------------------------------------------------------------------
select pg_temp.entrar_como('00000000-0000-0000-0000-00000000000b');

select pg_temp.checar(
  (select count(*) from public.clients) = 2,
  'colaborador enxerga todas as empresas');

select pg_temp.checar(
  (select count(*) from public.team_members) = 1,
  'colaborador enxerga os dados de RH');

-- ---------------------------------------------------------------------------
-- 4. Escalacao de privilegio
-- ---------------------------------------------------------------------------
do $$
declare
  escalou boolean := false;
begin
  perform pg_temp.entrar_como('00000000-0000-0000-0000-00000000000c');
  begin
    update public.users set role = 'socio'
    where id = '00000000-0000-0000-0000-00000000000c';
    escalou := true;
  exception when others then
    escalou := false;
  end;
  perform pg_temp.checar(not escalou, 'cliente nao consegue se promover a socio');
end;
$$;

do $$
declare
  escalou boolean := false;
begin
  perform pg_temp.entrar_como('00000000-0000-0000-0000-00000000000b');
  begin
    update public.users set role = 'socio'
    where id = '00000000-0000-0000-0000-00000000000b';
    escalou := true;
  exception when others then
    escalou := false;
  end;
  perform pg_temp.checar(not escalou, 'colaborador nao consegue se promover a socio');
end;
$$;

do $$
declare
  vinculou boolean := false;
begin
  perform pg_temp.entrar_como('00000000-0000-0000-0000-00000000000c');
  begin
    insert into public.client_users (client_id, user_id)
    values ('22222222-2222-2222-2222-222222222222',
            '00000000-0000-0000-0000-00000000000c');
    vinculou := true;
  exception when others then
    vinculou := false;
  end;
  perform pg_temp.checar(not vinculou, 'cliente nao consegue se vincular a outra empresa');
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. O que deve continuar funcionando
-- ---------------------------------------------------------------------------
select pg_temp.entrar_como('00000000-0000-0000-0000-00000000000c');
update public.users set nome = 'Nome Novo'
where id = '00000000-0000-0000-0000-00000000000c';

select pg_temp.checar(
  (select nome from public.users where id = '00000000-0000-0000-0000-00000000000c') = 'Nome Novo',
  'a pessoa edita o proprio nome');

select pg_temp.entrar_como('00000000-0000-0000-0000-00000000000a');
update public.users set role = 'desenvolvedor'
where id = '00000000-0000-0000-0000-00000000000b';

select pg_temp.checar(
  (select role from public.users where id = '00000000-0000-0000-0000-00000000000b') = 'desenvolvedor',
  'socio altera o perfil de outra pessoa');

reset role;
select set_config('request.jwt.claim.sub', '', true);

update public.users set role = 'socio' where email = 'colab@teste.com.br';

select pg_temp.checar(
  (select role from public.users where email = 'colab@teste.com.br') = 'socio',
  'admin (SQL Editor) promove o primeiro socio');

-- ---------------------------------------------------------------------------
-- 6. Anonimo nao le nada
-- ---------------------------------------------------------------------------
select set_config('role', 'anon', true);

select pg_temp.checar(
  (select count(*) from public.clients) = 0,
  'visitante sem sessao nao enxerga empresa alguma');

reset role;

rollback;

\echo ''
\echo '================================================'
\echo ' Todos os testes de RLS passaram.'
\echo '================================================'
