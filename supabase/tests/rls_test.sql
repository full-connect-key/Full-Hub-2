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
  ('11111111-1111-1111-1111-111111111111', 'Mundo Verde'),
  ('22222222-2222-2222-2222-222222222222', 'ABF');

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
-- 1. O trigger de auth provisiona public.profiles
-- ---------------------------------------------------------------------------
select pg_temp.checar(
  (select count(*) from public.profiles) = 4,
  'toda conta criada no auth ganha linha em public.profiles');

select pg_temp.checar(
  (select role from public.profiles where email = 'socio@teste.com.br') = 'socio',
  'o role vem do metadata de admin (raw_app_meta_data)');

-- Cadastro publico tentando escolher o proprio perfil: o role pedido em
-- raw_user_meta_data tem que ser ignorado.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000e', 'esperto@teste.com.br', '{"nome":"Esperto","role":"socio"}');

select pg_temp.checar(
  (select role from public.profiles where email = 'esperto@teste.com.br') = 'cliente',
  'cadastro publico nao consegue escolher o proprio role');

-- Metadata com valor invalido nao pode derrubar a criacao da conta.
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000000000f', 'invalido@teste.com.br', '{"role":"superadmin"}');

select pg_temp.checar(
  (select role from public.profiles where email = 'invalido@teste.com.br') = 'cliente',
  'role invalido no metadata cai para cliente sem quebrar o cadastro');

-- ---------------------------------------------------------------------------
-- 2. Isolamento por client_id
-- ---------------------------------------------------------------------------
select pg_temp.entrar_como('00000000-0000-0000-0000-00000000000c');

select pg_temp.checar(
  (select count(*) from public.clients) = 1
  and (select nome_empresa from public.clients) = 'Mundo Verde',
  'cliente Mundo Verde enxerga apenas a propria empresa');

select pg_temp.checar(
  (select slug from public.clients) = 'mundo-verde',
  'o slug e gerado a partir do nome da empresa');

select pg_temp.checar(
  public.current_user_client_slug() = 'mundo-verde',
  'o slug da empresa do usuario alimenta o redirecionamento pos-login');

select pg_temp.checar(
  (select count(*) from public.team_members) = 0,
  'cliente nao enxerga dados de RH da equipe');

select pg_temp.checar(
  (select count(*) from public.profiles) = 1,
  'cliente enxerga apenas o proprio usuario');

select pg_temp.entrar_como('00000000-0000-0000-0000-00000000000d');

select pg_temp.checar(
  (select nome_empresa from public.clients) = 'ABF',
  'cliente ABF enxerga apenas a propria empresa');

-- Criterio 11: mexer no client_id da consulta nao abre a conta alheia.
select pg_temp.checar(
  (select count(*) from public.clients
   where id = '11111111-1111-1111-1111-111111111111') = 0,
  'consultar o client_id da outra conta diretamente nao devolve nada');

select pg_temp.checar(
  (select count(*) from public.clients where slug = 'mundo-verde') = 0,
  'buscar pelo slug da outra conta nao devolve nada');

-- ---------------------------------------------------------------------------
-- 3. Equipe interna enxerga tudo
-- ---------------------------------------------------------------------------
select pg_temp.entrar_como('00000000-0000-0000-0000-00000000000b');

select pg_temp.checar(
  (select count(*) from public.clients) = 2,
  'colaborador enxerga todas as empresas');

-- O slug e unico: duas empresas de mesmo nome nao colidem no endereco.
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into public.clients (nome_empresa) values ('Mundo Verde'), ('Mundo Verde');

select pg_temp.checar(
  (select count(distinct slug) from public.clients where slug like 'mundo-verde%') = 3,
  'empresas homonimas recebem slugs distintos');

select pg_temp.checar(
  (select count(*) from public.clients where slug in ('mundo-verde-2', 'mundo-verde-3')) = 2,
  'a colisao de slug e resolvida com sufixo numerico');

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
    update public.profiles set role = 'socio'
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
    update public.profiles set role = 'socio'
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
update public.profiles set nome = 'Nome Novo'
where id = '00000000-0000-0000-0000-00000000000c';

select pg_temp.checar(
  (select nome from public.profiles where id = '00000000-0000-0000-0000-00000000000c') = 'Nome Novo',
  'a pessoa edita o proprio nome');

select pg_temp.entrar_como('00000000-0000-0000-0000-00000000000a');
update public.profiles set role = 'desenvolvedor'
where id = '00000000-0000-0000-0000-00000000000b';

select pg_temp.checar(
  (select role from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'desenvolvedor',
  'socio altera o perfil de outra pessoa');

reset role;
select set_config('request.jwt.claim.sub', '', true);

update public.profiles set role = 'socio' where email = 'colab@teste.com.br';

select pg_temp.checar(
  (select role from public.profiles where email = 'colab@teste.com.br') = 'socio',
  'admin (SQL Editor) promove o primeiro socio');

-- ---------------------------------------------------------------------------
-- 6. Sprint 2 — administracao de acessos
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', true);

-- Restaura os perfis mexidos pelos testes anteriores.
update public.profiles set role = 'socio'        where email = 'socio@teste.com.br';
update public.profiles set role = 'colaborador'  where email = 'colab@teste.com.br';

-- Um desenvolvedor, para separar admin de colaborador comum.
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000aa', 'dev@teste.com.br', '{"nome":"Dev"}', '{"role":"desenvolvedor"}');

-- Quem administra ----------------------------------------------------------
select pg_temp.entrar_como('00000000-0000-0000-0000-0000000000aa');

select pg_temp.checar(
  public.is_admin(),
  'desenvolvedor e reconhecido como administrador');

select pg_temp.checar(
  (select count(*) from public.clients) = 4,
  'desenvolvedor enxerga todas as empresas');

select pg_temp.entrar_como('00000000-0000-0000-0000-00000000000b');

select pg_temp.checar(
  not public.is_admin(),
  'colaborador nao e administrador');

do $$
declare
  criou boolean := false;
begin
  perform pg_temp.entrar_como('00000000-0000-0000-0000-00000000000b');
  begin
    insert into public.clients (nome_empresa) values ('Empresa Pirata');
    criou := true;
  exception when others then
    criou := false;
  end;
  perform pg_temp.checar(not criou, 'colaborador nao cadastra cliente');
end;
$$;

do $$
declare
  vinculou boolean := false;
begin
  perform pg_temp.entrar_como('00000000-0000-0000-0000-00000000000b');
  begin
    insert into public.client_users (client_id, user_id)
    values ('11111111-1111-1111-1111-111111111111',
            '00000000-0000-0000-0000-0000000000aa');
    vinculou := true;
  exception when others then
    vinculou := false;
  end;
  perform pg_temp.checar(not vinculou, 'colaborador nao vincula usuario a cliente');
end;
$$;

-- Cliente nao enxerga a equipe interna --------------------------------------
select pg_temp.entrar_como('00000000-0000-0000-0000-00000000000c');

select pg_temp.checar(
  (select count(*) from public.profiles) = 1,
  'cliente nao recebe a listagem da equipe interna');

select pg_temp.checar(
  (select count(*) from public.client_users) = 1,
  'cliente enxerga apenas o proprio vinculo');

select pg_temp.checar(
  (select count(*) from public.activity_log) = 0,
  'cliente nao le a auditoria');

-- Um usuario cliente pertence a uma unica conta -----------------------------
do $$
declare
  duplicou boolean := false;
begin
  perform pg_temp.entrar_como('00000000-0000-0000-0000-0000000000aa');
  begin
    insert into public.client_users (client_id, user_id)
    values ('22222222-2222-2222-2222-222222222222',
            '00000000-0000-0000-0000-00000000000c');
    duplicou := true;
  exception when others then
    duplicou := false;
  end;
  perform pg_temp.checar(not duplicou,
    'nem o admin vincula o mesmo usuario a duas contas');
end;
$$;

-- O client_id de um vinculo nao se troca por update --------------------------
do $$
declare
  moveu boolean := false;
begin
  perform pg_temp.entrar_como('00000000-0000-0000-0000-0000000000aa');
  begin
    update public.client_users
    set client_id = '22222222-2222-2222-2222-222222222222'
    where user_id = '00000000-0000-0000-0000-00000000000c';
    moveu := true;
  exception when others then
    moveu := false;
  end;
  perform pg_temp.checar(not moveu,
    'o cliente de um usuario nao muda por atualizacao direta');
end;
$$;

-- Usuario desativado perde o acesso -----------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', true);
update public.profiles set ativo = false where email = 'clientea@teste.com.br';

select pg_temp.entrar_como('00000000-0000-0000-0000-00000000000c');

select pg_temp.checar(
  (select count(*) from public.clients) = 0,
  'usuario desativado nao enxerga a propria empresa');

select pg_temp.checar(
  public.current_user_client_slug() is null,
  'usuario desativado nao tem destino de portal');

select pg_temp.checar(
  public.current_user_role() is null,
  'usuario desativado nao carrega perfil');

reset role;
select set_config('request.jwt.claim.sub', '', true);
update public.profiles set ativo = true where email = 'clientea@teste.com.br';

select pg_temp.entrar_como('00000000-0000-0000-0000-00000000000c');
select pg_temp.checar(
  public.current_user_client_slug() = 'mundo-verde',
  'reativar devolve o acesso sem recriar nada');

-- Empresa desativada bloqueia todos os usuarios dela ------------------------
reset role;
select set_config('request.jwt.claim.sub', '', true);
update public.clients set ativo = false where slug = 'mundo-verde';

select pg_temp.entrar_como('00000000-0000-0000-0000-00000000000c');
select pg_temp.checar(
  public.current_user_client_slug() is null,
  'empresa inativa bloqueia o portal dos seus usuarios');

select pg_temp.entrar_como('00000000-0000-0000-0000-00000000000d');
select pg_temp.checar(
  public.current_user_client_slug() = 'abf',
  'a outra empresa continua funcionando normalmente');

reset role;
select set_config('request.jwt.claim.sub', '', true);
update public.clients set ativo = true where slug = 'mundo-verde';

-- Ninguem reativa o proprio acesso ------------------------------------------
do $$
declare
  reativou boolean := false;
begin
  perform pg_temp.entrar_como('00000000-0000-0000-0000-00000000000b');
  begin
    update public.profiles set ativo = false where id = '00000000-0000-0000-0000-00000000000b';
    reativou := true;
  exception when others then
    reativou := false;
  end;
  perform pg_temp.checar(not reativou, 'colaborador nao altera o proprio campo ativo');
end;
$$;

do $$
declare
  exigiu boolean := false;
begin
  perform pg_temp.entrar_como('00000000-0000-0000-0000-00000000000b');
  begin
    update public.profiles set deve_trocar_senha = true
    where id = '00000000-0000-0000-0000-00000000000b';
    exigiu := true;
  exception when others then
    exigiu := false;
  end;
  perform pg_temp.checar(not exigiu,
    'usuario comum nao exige troca de senha para si');
end;
$$;

-- Concluir a propria troca de senha continua possivel ------------------------
reset role;
select set_config('request.jwt.claim.sub', '', true);
update public.profiles set deve_trocar_senha = true where id = '00000000-0000-0000-0000-00000000000b';

select pg_temp.entrar_como('00000000-0000-0000-0000-00000000000b');
update public.profiles set deve_trocar_senha = false where id = '00000000-0000-0000-0000-00000000000b';

select pg_temp.checar(
  (select deve_trocar_senha from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = false,
  'a pessoa conclui a propria troca de senha');

-- Auditoria ------------------------------------------------------------------
select pg_temp.entrar_como('00000000-0000-0000-0000-0000000000aa');
insert into public.activity_log (acao, ator_id, alvo_user_id)
values ('colaborador_criado', '00000000-0000-0000-0000-0000000000aa',
        '00000000-0000-0000-0000-00000000000b');

select pg_temp.checar(
  (select count(*) from public.activity_log) = 1,
  'admin registra e le a auditoria');

do $$
declare
  escreveu boolean := false;
begin
  perform pg_temp.entrar_como('00000000-0000-0000-0000-00000000000b');
  begin
    insert into public.activity_log (acao, ator_id) values ('forjado', auth.uid());
    escreveu := true;
  exception when others then
    escreveu := false;
  end;
  perform pg_temp.checar(not escreveu, 'colaborador nao escreve na auditoria');
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Anonimo nao le nada
-- ---------------------------------------------------------------------------
-- Sem sessao: nem role de usuario, nem claim de JWT.
select set_config('request.jwt.claim.sub', '', true);
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
